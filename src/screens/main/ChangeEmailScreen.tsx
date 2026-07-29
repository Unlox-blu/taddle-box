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
import { maskPhone } from '../../utils/mask.util';

type Props = NativeStackScreenProps<HomeStackParamList, 'ChangeEmail'>;

export default function ChangeEmailScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const { user, refreshUser } = useAuth();
  
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1
  const [password, setPassword] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [phone, setPhone] = useState('');

  // Step 2
  const [email, setEmail] = useState('');

  // Step 3
  const OTP_LENGTH = 6;
  const [emailOtp, setEmailOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [phoneOtp, setPhoneOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const emailOtpRefs = useRef<(TextInput | null)[]>([]);
  const phoneOtpRefs = useRef<(TextInput | null)[]>([]);
  const [timer, setTimer] = useState(30);
  const registeredPhone = user?.phone || user?.phoneNumber || '';
  const registeredCountryCode = user?.countryCode || '+91';

  const normalizePhone = (value?: string) => (value || '').replace(/\D/g, '');
  const normalizeCountryCode = (value?: string) => {
    const digits = normalizePhone(value);
    return digits ? `+${digits}` : '';
  };

  useEffect(() => {
    if (registeredCountryCode) {
      setCountryCode(registeredCountryCode);
    }
  }, [registeredCountryCode]);

  useEffect(() => {
    if (step === 3 && timer > 0) {
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
    if (!phone) {
      setError('Current phone number is required');
      return;
    }
    const normalizedPhone = normalizePhone(phone);
    const normalizedRegisteredPhone = normalizePhone(registeredPhone);
    const normalizedCountryCode = normalizeCountryCode(countryCode);
    const normalizedRegisteredCountryCode = normalizeCountryCode(registeredCountryCode);

    if (!normalizedRegisteredPhone) {
      setError('A registered phone number is required to change email');
      return;
    }
    try {
      setLoading(true);
      await authService.verifyPassword({
        password,
        countryCode: normalizedCountryCode,
        phone: normalizedPhone,
      });
      setStep(2);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Incorrect password');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async () => {
    setError('');
    if (!email) {
      setError('New email address is required');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }
    try {
      setLoading(true);
      await authService.requestChangeEmailOtp({ newEmail: email.toLowerCase().trim() });
      setStep(3);
      setTimer(30);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to request OTPs');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (timer > 0) return;
    try {
      setLoading(true);
      await authService.requestChangeEmailOtp({ newEmail: email.toLowerCase().trim() });
      setTimer(30);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to resend OTPs');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpInput = (type: 'email' | 'phone', val: string, idx: number) => {
    if (!/^\d*$/.test(val)) return;
    setError('');
    
    const currentOtp = type === 'email' ? emailOtp : phoneOtp;
    const setOtp = type === 'email' ? setEmailOtp : setPhoneOtp;
    const refs = type === 'email' ? emailOtpRefs : phoneOtpRefs;
    
    let next = [...currentOtp];

    if (val.length > 1) {
      const cleaned = val.replace(/\D/g, '');
      for (let i = 0; i < cleaned.length; i++) {
        if (idx + i < OTP_LENGTH) {
          next[idx + i] = cleaned[i];
        }
      }
      setOtp(next);
      if (idx + cleaned.length >= OTP_LENGTH) {
        refs.current[OTP_LENGTH - 1]?.blur();
      } else {
        refs.current[idx + cleaned.length]?.focus();
      }
      return;
    }

    next[idx] = val;
    setOtp(next);
    if (val !== '' && idx < OTP_LENGTH - 1) {
      refs.current[idx + 1]?.focus();
    }
  };

  const handleOtpBackspace = (type: 'email' | 'phone', e: any, idx: number) => {
    const currentOtp = type === 'email' ? emailOtp : phoneOtp;
    const setOtp = type === 'email' ? setEmailOtp : setPhoneOtp;
    const refs = type === 'email' ? emailOtpRefs : phoneOtpRefs;

    if (e.nativeEvent.key === 'Backspace' && !currentOtp[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
      let next = [...currentOtp];
      next[idx - 1] = '';
      setOtp(next);
    }
  };

  const handleVerifyAndUpdate = async () => {
    const eOtp = emailOtp.join('');
    const pOtp = phoneOtp.join('');
    if (eOtp.length < OTP_LENGTH || pOtp.length < OTP_LENGTH) {
      setError('Please enter both complete OTPs');
      return;
    }
    try {
      setLoading(true);
      await authService.verifyChangeEmailOtp({ emailOtp: eOtp, phoneOtp: pOtp });
      await refreshUser();
      Alert.alert('Success', 'Email address updated successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Invalid OTP');
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
                For your security, please verify your identity by entering your current password and registered phone number.
              </Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 0.3 }}>
                  <Input
                    label="Code"
                    value={countryCode}
                    onChangeText={(text) => { setCountryCode(text); setError(''); }}
                    keyboardType="phone-pad"
                  />
                </View>
                <View style={{ flex: 0.7 }}>
                  <Input
                    label="Registered Phone"
                    value={phone}
                    onChangeText={(text) => { setPhone(text); setError(''); }}
                    keyboardType="phone-pad"
                    icon="call-outline"
                  />
                </View>
              </View>
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
                Enter your new email address below. We will send a verification code to both your registered phone number and this new email address.
              </Text>
              <Input
                label="New Email Address"
                value={email}
                onChangeText={(text) => { setEmail(text); setError(''); }}
                icon="mail-outline"
                autoCapitalize="none"
                keyboardType="email-address"
                containerStyle={styles.inputContainer}
              />
              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
              <Button label="Send OTPs" onPress={handleRequestOtp} variant="primary" fullWidth loading={loading} style={styles.btn} />
            </View>
          )}

          {step === 3 && (
            <View>
              <Text style={[styles.instruction, { color: colors.text.secondary }]}>
                We've sent 6-digit verification codes to your registered phone number ({maskPhone(user?.countryCode || '+91', user?.phone || user?.phoneNumber || '')}) and your new email address.
              </Text>
              
              <Text style={[styles.label, { color: colors.text.primary }]}>Phone OTP</Text>
              <View style={styles.otpContainer}>
                {phoneOtp.map((digit, idx) => (
                  <TextInput
                    key={`phone-otp-${idx}`}
                    ref={(el) => { phoneOtpRefs.current[idx] = el; }}
                    style={[
                      styles.otpBox,
                      { color: colors.text.primary, borderColor: digit ? colors.primary : colors.border, backgroundColor: colors.bg.surface }
                    ]}
                    keyboardType="number-pad"
                    maxLength={6}
                    value={digit}
                    onChangeText={(val) => handleOtpInput('phone', val, idx)}
                    onKeyPress={(e) => handleOtpBackspace('phone', e, idx)}
                    textAlign="center"
                    selectionColor={colors.primaryLight}
                  />
                ))}
              </View>

              <View style={{ height: spacing.lg }} />

              <Text style={[styles.label, { color: colors.text.primary }]}>Email OTP</Text>
              <View style={styles.otpContainer}>
                {emailOtp.map((digit, idx) => (
                  <TextInput
                    key={`email-otp-${idx}`}
                    ref={(el) => { emailOtpRefs.current[idx] = el; }}
                    style={[
                      styles.otpBox,
                      { color: colors.text.primary, borderColor: digit ? colors.primary : colors.border, backgroundColor: colors.bg.surface }
                    ]}
                    keyboardType="number-pad"
                    maxLength={6}
                    value={digit}
                    onChangeText={(val) => handleOtpInput('email', val, idx)}
                    onKeyPress={(e) => handleOtpBackspace('email', e, idx)}
                    textAlign="center"
                    selectionColor={colors.primaryLight}
                  />
                ))}
              </View>

              <TouchableOpacity onPress={handleResendOtp} disabled={timer > 0} style={styles.resendBtn}>
                <Text style={[styles.resendText, { color: timer > 0 ? colors.text.muted : colors.primary }]}>
                  {timer > 0 ? `Resend OTPs in ${timer}s` : 'Resend OTPs'}
                </Text>
              </TouchableOpacity>

              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
              <Button label="Verify & Update" onPress={handleVerifyAndUpdate} variant="primary" fullWidth loading={loading} style={styles.btn} />
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: { padding: spacing.xs },
  title: { fontSize: fontSizes.xl, fontWeight: '700' },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl * 2 },
  instruction: {
    fontSize: fontSizes.md,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  inputContainer: { marginBottom: spacing.lg },
  btn: { marginTop: spacing.md },
  error: {
    fontSize: fontSizes.sm,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  otpBox: {
    width: 48,
    height: 56,
    borderWidth: 1.5,
    borderRadius: 12,
    fontSize: fontSizes.xl,
    fontWeight: '600',
  },
  resendBtn: {
    alignSelf: 'center',
    marginTop: spacing.xl,
    padding: spacing.sm,
  },
  resendText: {
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
});
