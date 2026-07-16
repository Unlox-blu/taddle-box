import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Animated, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, fontSizes, spacing } from '../../theme';
import Button from '../../components/common/Button';
import type { AuthStackParamList } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/auth.service';

const OTP_LENGTH = 6;
type Props = NativeStackScreenProps<AuthStackParamList, 'OTP'>;

export default function OTPScreen({ navigation, route }: Props) {
  const { signIn } = useAuth();
  
  const [step, setStep] = useState<'email' | 'phone'>('email');
  const [emailOtp, setEmailOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [phoneOtp, setPhoneOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  
  const [loading, setLoading]   = useState(false);
  const [verified, setVerified] = useState(false);
  const [timer, setTimer]       = useState(30);
  const refs = useRef<(TextInput | null)[]>([]);
  const checkAnim = useRef(new Animated.Value(0)).current;

  // @ts-ignore
  const signupData = route.params?.signupData || {};
  // @ts-ignore
  const verificationToken = route.params?.verificationToken;

  // Reset state if email/phone changes (edge case: user went back to edit)
  useEffect(() => {
    setStep('email');
    setEmailOtp(Array(OTP_LENGTH).fill(''));
    setPhoneOtp(Array(OTP_LENGTH).fill(''));
    setTimer(30);
    setVerified(false);
  }, [signupData.email, signupData.phone]);

  useEffect(() => {
    if (timer <= 0) return;
    const t = setTimeout(() => setTimer(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [timer]);

  const activeOtp = step === 'email' ? emailOtp : phoneOtp;
  const setActiveOtp = step === 'email' ? setEmailOtp : setPhoneOtp;

  const handleInput = (val: string, idx: number) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...activeOtp];
    next[idx] = val.slice(-1);
    setActiveOtp(next);
    if (val && idx < OTP_LENGTH - 1) refs.current[idx + 1]?.focus();
    if (next.every(d => d !== '') && next.join('').length === OTP_LENGTH) {
      if (step === 'email') {
        handleNextStep();
      } else {
        handleVerify(next.join(''));
      }
    }
  };

  const handleKeyPress = (key: string, idx: number) => {
    if (key === 'Backspace' && !activeOtp[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
  };

  const handleNextStep = () => {
    setStep('phone');
    setTimer(30);
    // Focus first input of next step
    setTimeout(() => refs.current[0]?.focus(), 100);
  };

  const handleVerify = async (finalPhoneCode?: string) => {
    setLoading(true);
    try {
      const eCode = emailOtp.join('');
      const pCode = finalPhoneCode || phoneOtp.join('');

      // 1. Verify both OTPs
      await authService.verifyOtp({ emailOtp: eCode, phoneOtp: pCode }, verificationToken);

      // 2. Signup user
      const res = await authService.signup(signupData, verificationToken);
      
      setVerified(true);
      Animated.spring(checkAnim, { toValue: 1, useNativeDriver: true, tension: 50 }).start();
      
      const accessToken = res.data?.sessionData?.accessToken || res.sessionData?.accessToken || res.data?.accessToken;
      const refreshToken = res.data?.sessionData?.refreshToken || res.sessionData?.refreshToken || res.data?.refreshToken;
      
      setTimeout(() => {
        signIn(accessToken, refreshToken);
      }, 1200);

    } catch (e: any) {
      console.log('OTP Verify Error:', JSON.stringify(e.response?.data, null, 2));
      const errors = e.response?.data?.errors;
      const errMsg = errors ? JSON.stringify(errors) : (e.response?.data?.message || e.message);
      alert(errMsg || 'Verification failed');
      // If verification failed, reset phone so they can try again
      setPhoneOtp(Array(OTP_LENGTH).fill(''));
      refs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setTimer(30);
    try {
      await authService.sendOtp({
        email: signupData.email,
        countryCode: signupData.countryCode,
        phone: signupData.phone
      });
    } catch (e) {
      // Ignore
    }
  };

  const checkScale = checkAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <LinearGradient colors={['#070714', '#0E0E24']} style={styles.container}>
      <StatusBar style="light" />

      <TouchableOpacity onPress={() => step === 'phone' ? setStep('email') : navigation.goBack()} style={styles.back}>
        <Ionicons name="arrow-back" size={22} color={colors.text.secondary} />
      </TouchableOpacity>

      <View style={styles.content}>
        {verified ? (
          <Animated.View style={[styles.successWrap, { transform: [{ scale: checkScale }] }]}>
            <LinearGradient colors={[colors.success, '#059669']} style={styles.successCircle}>
              <Ionicons name="checkmark" size={44} color="#fff" />
            </LinearGradient>
            <Text style={styles.successText}>Verified! 🎉</Text>
          </Animated.View>
        ) : (
          <>
            <View style={styles.phoneIcon}>
              <Text style={styles.phoneEmoji}>{step === 'email' ? '✉️' : '📱'}</Text>
            </View>
            <Text style={styles.title}>
              Verify your {step === 'email' ? 'Email' : 'Phone'}
            </Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to{'\n'}
              <Text style={styles.phone}>
                {step === 'email' ? signupData.email : signupData.phone}
              </Text>
            </Text>

            {/* OTP Inputs */}
            <View style={styles.otpRow}>
              {activeOtp.map((digit, i) => (
                <TextInput
                  key={`${step}-${i}`}
                  ref={r => { refs.current[i] = r; }}
                  style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                  value={digit}
                  onChangeText={v => handleInput(v, i)}
                  onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
                  maxLength={1}
                  keyboardType="number-pad"
                  textAlign="center"
                  autoFocus={i === 0}
                />
              ))}
            </View>

            {/* Resend */}
            <View style={styles.resendRow}>
              {timer > 0 ? (
                <Text style={styles.timerText}>Resend in <Text style={{ color: colors.primaryLight }}>{timer}s</Text></Text>
              ) : (
                <TouchableOpacity onPress={handleResend}>
                  <Text style={styles.resendText}>Resend OTP →</Text>
                </TouchableOpacity>
              )}
            </View>

            <Button
              label={step === 'email' ? "Next →" : "Verify & Complete →"}
              onPress={step === 'email' ? handleNextStep : () => handleVerify()}
              variant="primary"
              fullWidth
              loading={loading}
              disabled={activeOtp.some(d => !d)}
            />
          </>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  back: {
    marginTop: 60, marginBottom: 24,
    width: 40, height: 40, borderRadius: radii.md,
    backgroundColor: colors.bg.card,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  content: { flex: 1, alignItems: 'center', paddingTop: 20 },
  phoneIcon: {
    width: 80, height: 80,
    borderRadius: 24,
    backgroundColor: colors.bg.card,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
  },
  phoneEmoji: { fontSize: 38 },
  title: { fontSize: fontSizes.h2, fontWeight: '800', color: colors.text.primary, marginBottom: 10 },
  subtitle: { fontSize: fontSizes.md, color: colors.text.muted, textAlign: 'center', lineHeight: 22, marginBottom: 36 },
  phone: { color: colors.primaryLight, fontWeight: '700' },
  otpRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  otpBox: {
    width: 46, height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.bg.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    fontSize: fontSizes.xl,
    fontWeight: '800',
    color: colors.text.primary,
  },
  otpBoxFilled: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(124,58,237,0.12)',
    color: colors.primaryLight,
  },
  resendRow: { marginBottom: 28 },
  timerText: { fontSize: fontSizes.sm, color: colors.text.muted },
  resendText: { fontSize: fontSizes.sm, color: colors.primaryLight, fontWeight: '700' },
  successWrap: { alignItems: 'center', gap: 16, paddingTop: 60 },
  successCircle: {
    width: 100, height: 100,
    borderRadius: 50,
    alignItems: 'center', justifyContent: 'center',
  },
  successText: { fontSize: fontSizes.xxl, fontWeight: '800', color: colors.text.primary },
});
