import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ScrollView, Alert, KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useThemeColors } from '../../context/ThemeContext';
import { fontSizes, spacing } from '../../theme';
import type { HomeStackParamList } from '../../types';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { authService } from '../../services/auth.service';
import { useAuth } from '../../context/AuthContext';

type Props = NativeStackScreenProps<HomeStackParamList, 'ChangeEmail'>;

export default function ChangeEmailScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const { user, refreshUser } = useAuth();
  
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1
  const [password, setPassword] = useState('');

  // Step 2
  const OTP_LENGTH = 6;
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const otpRefs = useRef<(TextInput | null)[]>([]);
  const [timer, setTimer] = useState(30);
  const [changeToken, setChangeToken] = useState('');

  // Step 3
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (step === 2 && timer > 0) {
      const t = setTimeout(() => setTimer(v => v - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [step, timer]);

  const handleVerifyPassword = async () => {
    setError('');
    if (!password) {
      setError('Password is required');
      return;
    }
    try {
      setLoading(true);
      await authService.verifyPassword(password);
      // Password verified, send OTP to phone
      await authService.sendPhoneOtp({ 
        countryCode: user.countryCode || '+91', 
        phone: user.phone, 
        purpose: 'change_email' 
      });
      setStep(2);
      setTimer(30);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Incorrect password');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (timer > 0) return;
    try {
      setLoading(true);
      await authService.sendPhoneOtp({ 
        countryCode: user.countryCode || '+91', 
        phone: user.phone, 
        purpose: 'change_email' 
      });
      setTimer(30);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to resend OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpInput = (val: string, idx: number) => {
    if (!/^\d*$/.test(val)) return;
    setError('');
    let next = [...otp];

    if (val.length > 1) {
      const cleaned = val.replace(/\D/g, '');
      for (let i = 0; i < cleaned.length; i++) {
        if (idx + i < OTP_LENGTH) {
          next[idx + i] = cleaned[i];
        }
      }
      setOtp(next);
      if (idx + cleaned.length >= OTP_LENGTH) {
        otpRefs.current[OTP_LENGTH - 1]?.blur();
      } else {
        otpRefs.current[idx + cleaned.length]?.focus();
      }
      return;
    }

    next[idx] = val;
    setOtp(next);
    if (val !== '' && idx < OTP_LENGTH - 1) {
      otpRefs.current[idx + 1]?.focus();
    }
  };

  const handleOtpBackspace = (e: any, idx: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
      let next = [...otp];
      next[idx - 1] = '';
      setOtp(next);
    }
  };

  const handleVerifyOtp = async () => {
    const enteredOtp = otp.join('');
    if (enteredOtp.length < OTP_LENGTH) {
      setError('Please enter complete OTP');
      return;
    }
    try {
      setLoading(true);
      const res = await authService.verifyPhoneOtp({ otp: enteredOtp, purpose: 'change_email' });
      setChangeToken(res.data.changeToken);
      setStep(3);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateEmail = async () => {
    setError('');
    if (!email || !email.includes('@')) {
      setError('Valid email address is required');
      return;
    }
    try {
      setLoading(true);
      await authService.updateEmail({ changeToken, email });
      await refreshUser();
      Alert.alert('Success', 'Email address updated successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to update email address');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg.base }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text.primary }]}>Change Linked Email</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          
          {step === 1 && (
            <View>
              <Text style={[styles.instruction, { color: colors.text.secondary }]}>
                For your security, please verify your identity by entering your current password.
              </Text>
              <Input
                label="Current Password"
                value={password}
                onChangeText={(text) => { setPassword(text); setError(''); }}
                icon="lock-closed-outline"
                secureTextEntry
                containerStyle={styles.inputContainer}
              />
              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
              <Button label="Continue" onPress={handleVerifyPassword} variant="primary" fullWidth loading={loading} style={styles.btn} />
            </View>
          )}

          {step === 2 && (
            <View>
              <Text style={[styles.instruction, { color: colors.text.secondary }]}>
                We've sent a 6-digit OTP to your linked phone number <Text style={{fontWeight:'700', color: colors.text.primary}}>{user.phone}</Text>.
              </Text>
              
              <View style={styles.otpContainer}>
                {otp.map((digit, idx) => (
                  <TextInput
                    key={`otp-${idx}`}
                    ref={(el) => { otpRefs.current[idx] = el; }}
                    style={[
                      styles.otpBox,
                      { color: colors.text.primary, borderColor: digit ? colors.primary : colors.border, backgroundColor: colors.bg.surface }
                    ]}
                    keyboardType="number-pad"
                    maxLength={6}
                    value={digit}
                    onChangeText={(val) => handleOtpInput(val, idx)}
                    onKeyPress={(e) => handleOtpBackspace(e, idx)}
                  />
                ))}
              </View>

              <TouchableOpacity onPress={handleResendOtp} disabled={timer > 0} style={styles.resendBtn}>
                <Text style={[styles.resendText, { color: timer > 0 ? colors.text.muted : colors.primary }]}>
                  {timer > 0 ? `Resend OTP in ${timer}s` : 'Resend OTP'}
                </Text>
              </TouchableOpacity>

              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
              <Button label="Verify" onPress={handleVerifyOtp} variant="primary" fullWidth loading={loading} style={styles.btn} />
            </View>
          )}

          {step === 3 && (
            <View>
              <Text style={[styles.instruction, { color: colors.text.secondary }]}>
                Enter your new email address below.
              </Text>
              <Input
                label="New Email Address"
                value={email}
                onChangeText={(text) => { setEmail(text); setError(''); }}
                keyboardType="email-address"
                autoCapitalize="none"
                containerStyle={styles.inputContainer}
              />
              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
              <Button label="Update Email" onPress={handleUpdateEmail} variant="primary" fullWidth loading={loading} style={styles.btn} />
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1,
  },
  backBtn: { padding: spacing.xs },
  title: { fontSize: fontSizes.lg, fontWeight: '600' },
  content: { padding: spacing.xl },
  instruction: { fontSize: fontSizes.md, lineHeight: 22, marginBottom: spacing.xl },
  inputContainer: { width: '100%', marginBottom: spacing.md },
  btn: { marginTop: spacing.md },
  error: { fontSize: fontSizes.sm, textAlign: 'center', marginBottom: spacing.md },
  otpContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xl },
  otpBox: {
    width: 48, height: 56, borderWidth: 1, borderRadius: 12,
    fontSize: 24, fontWeight: '700', textAlign: 'center',
  },
  resendBtn: { alignSelf: 'center', marginBottom: spacing.xl },
  resendText: { fontSize: fontSizes.sm, fontWeight: '600' },
});
