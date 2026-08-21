import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Animated, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { radii, fontSizes, spacing } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import type { AuthStackParamList } from '../../types';
import { authService } from '../../services/auth.service';
import { maskEmail, maskPhone } from '../../utils/mask.util';

const OTP_LENGTH = 6;
type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export default function ForgotPasswordScreen({ navigation, route }: Props) {
  const { colors: themeColors, isDark } = useTheme();
  const styles = React.useMemo(() => getStyles(themeColors, isDark), [themeColors, isDark]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [identifier, setIdentifier] = useState(route.params?.initialIdentifier || '');
  const [resolvedEmail, setResolvedEmail] = useState('');
  const [resolvedPhone, setResolvedPhone] = useState('');
  const [resetToken, setResetToken] = useState('');
  
  const [emailOtp, setEmailOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [phoneOtp, setPhoneOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [hasPhone, setHasPhone] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [timer, setTimer] = useState(30);

  const emailRefs = useRef<(TextInput | null)[]>([]);
  const phoneRefs = useRef<(TextInput | null)[]>([]);
  const checkAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (step === 2 && timer > 0) {
      const t = setTimeout(() => setTimer(v => v - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [step, timer]);

  const handleSendOtp = async () => {
    if (!identifier.trim()) {
      setErrorMsg('Please enter your email, phone number or username');
      return;
    }
    try {
      setLoading(true);
      setErrorMsg('');
      const res = await authService.forgotPassword(identifier.toLowerCase().trim());
      const resolved = res.data?.email || res.email || '';
      setResolvedEmail(resolved);
      const phone = res.data?.phone || res.phone || '';
      setResolvedPhone(phone);
      setHasPhone(!!res?.data?.hasPhone || !!res?.hasPhone);
      setStep(2);
      setTimer(30);
    } catch (e: any) {
      setErrorMsg(e.response?.data?.message || 'Failed to send OTP. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (timer > 0) return;
    try {
      await authService.forgotPassword(identifier.toLowerCase().trim());
      setTimer(30);
      setEmailOtp(Array(OTP_LENGTH).fill(''));
      setPhoneOtp(Array(OTP_LENGTH).fill(''));
      emailRefs.current[0]?.focus();
    } catch (e) {
      // Ignore
    }
  };

  const handleOtpInput = (val: string, idx: number, type: 'email' | 'phone') => {
    if (!/^\d*$/.test(val)) return;
    setErrorMsg('');
    const isEmail = type === 'email';
    const activeOtp = isEmail ? emailOtp : phoneOtp;
    const setActiveOtp = isEmail ? setEmailOtp : setPhoneOtp;
    const activeRefs = isEmail ? emailRefs : phoneRefs;

    let next = [...activeOtp];

    if (val.length > 1) {
      const cleaned = val.replace(/\D/g, '');
      for (let i = 0; i < cleaned.length; i++) {
        if (idx + i < OTP_LENGTH) next[idx + i] = cleaned[i];
      }
      setActiveOtp(next);
      
      if (idx + cleaned.length >= OTP_LENGTH) {
        if (isEmail && hasPhone) {
          phoneRefs.current[0]?.focus();
        } else {
          activeRefs.current[OTP_LENGTH - 1]?.blur();
        }
      } else {
        activeRefs.current[idx + cleaned.length]?.focus();
      }
      return;
    }

    next[idx] = val;
    setActiveOtp(next);

    if (val && idx < OTP_LENGTH - 1) {
      activeRefs.current[idx + 1]?.focus();
    } else if (val && idx === OTP_LENGTH - 1 && isEmail && hasPhone) {
      phoneRefs.current[0]?.focus();
    }
  };

  const handleOtpKeyPress = (key: string, idx: number, type: 'email' | 'phone') => {
    const isEmail = type === 'email';
    const activeOtp = isEmail ? emailOtp : phoneOtp;
    const setActiveOtp = isEmail ? setEmailOtp : setPhoneOtp;
    const activeRefs = isEmail ? emailRefs : phoneRefs;

    if (key === 'Backspace') {
      if (!activeOtp[idx] && idx > 0) {
        const next = [...activeOtp];
        next[idx - 1] = '';
        setActiveOtp(next);
        activeRefs.current[idx - 1]?.focus();
      } else if (!activeOtp[idx] && idx === 0 && !isEmail && hasPhone) {
        // Jump from phone back to email
        const nextEmail = [...emailOtp];
        nextEmail[OTP_LENGTH - 1] = '';
        setEmailOtp(nextEmail);
        emailRefs.current[OTP_LENGTH - 1]?.focus();
      }
    }
  };

  const handleVerifyOtp = async () => {
    if (emailOtp.join('').length < OTP_LENGTH || (hasPhone && phoneOtp.join('').length < OTP_LENGTH)) {
      setErrorMsg('Please enter the complete 6-digit OTPs');
      return;
    }
    try {
      setLoading(true);
      setErrorMsg('');
      const res = await authService.verifyResetPasswordOtp({
        email: resolvedEmail,
        emailOtp: emailOtp.join(''),
        phoneOtp: hasPhone ? phoneOtp.join('') : undefined,
      });
      setResetToken(res.data.token || res.token);
      setStep(3);
    } catch (e: any) {
      setErrorMsg(e.response?.data?.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setErrorMsg('');
    if (newPassword.length < 8) {
      setErrorMsg('Password must be at least 8 characters');
      return;
    }
    if (!/[a-z]/.test(newPassword)) {
      setErrorMsg('Password must contain at least one lowercase letter');
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setErrorMsg('Password must contain at least one uppercase letter');
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setErrorMsg('Password must contain at least one number');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match');
      return;
    }
    try {
      setLoading(true);
      await authService.resetPassword({
        token: resetToken,
        password: newPassword,
      });
      Animated.spring(checkAnim, { toValue: 1, useNativeDriver: true, tension: 50 }).start();
      setTimeout(() => navigation.navigate('Login'), 1500);
    } catch (e: any) {
      const msg = e.response?.data?.message || 'Failed to reset password.';
      setErrorMsg(msg);
      if (msg.toLowerCase().includes('otp') || msg.toLowerCase().includes('expired')) {
        setStep(2);
        if (msg.toLowerCase().includes('email')) {
           setEmailOtp(Array(OTP_LENGTH).fill(''));
           emailRefs.current[0]?.focus();
        } else {
           setPhoneOtp(Array(OTP_LENGTH).fill(''));
           phoneRefs.current[0]?.focus();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const checkScale = checkAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  
  const isEmailError = errorMsg.toLowerCase().includes('email');
  const isPhoneError = errorMsg.toLowerCase().includes('phone');
  const isGeneralError = !isEmailError && !isPhoneError && !!errorMsg;

  return (
    <LinearGradient colors={[themeColors.bg.base, themeColors.bg.surface]} style={styles.container}>
      <StatusBar style={isDark ? "light" : "dark"} />

      <TouchableOpacity
        onPress={() => step === 1 ? navigation.goBack() : setStep(s => (s - 1) as 1 | 2 | 3)}
        style={styles.back}
      >
        <Ionicons name="arrow-back" size={22} color={themeColors.text.secondary} />
      </TouchableOpacity>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ── Step 1: Enter email ── */}
          {step === 1 && (
            <>
              <View style={styles.iconBox}>
                <Text style={{ fontSize: 40 }}>🔐</Text>
              </View>
              <Text style={styles.title}>Forgot Password?</Text>
              <Text style={styles.subtitle}>Enter the email, phone number, or username linked to your account.</Text>
              <Input
                label="Email, Phone or Username"
                icon="person-outline"
                value={identifier}
                onChangeText={v => { setIdentifier(v); setErrorMsg(''); }}
                placeholder="Enter your account info"
                autoCapitalize="none"
                containerStyle={{ width: '100%', marginBottom: 12 }}
                forceDark={isDark}
              />
              {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
              <Button label="Verify Identity →" onPress={handleSendOtp} variant="primary" fullWidth loading={loading} style={{ marginTop: 12 }} />
              <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
                <Text style={styles.backLink}>← Back to Login</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Step 2: OTP (same style as OTPScreen) ── */}
          {step === 2 && (
            <>
              <View style={styles.iconRow}>
                <View style={styles.phoneIcon}>
                  <Text style={styles.phoneEmoji}>✉️</Text>
                </View>
                {hasPhone && (
                  <View style={styles.phoneIcon}>
                    <Text style={styles.phoneEmoji}>📱</Text>
                  </View>
                )}
              </View>
              <Text style={styles.title}>Verify your Identity</Text>
              <Text style={styles.subtitle}>
                We sent 6-digit codes to your {hasPhone ? 'email and phone' : 'email'}.
              </Text>

              {/* Email OTP Inputs */}
              <View style={styles.otpSection}>
                <Text style={styles.otpSectionTitle}>Email Code sent to <Text style={styles.highlight}>{maskEmail(resolvedEmail)}</Text></Text>
                <View style={styles.otpRow}>
                  {emailOtp.map((digit, i) => (
                    <TextInput
                      key={`email-${i}`}
                      ref={r => { emailRefs.current[i] = r; }}
                      style={[
                        styles.otpBox,
                        digit ? styles.otpBoxFilled : null,
                        (errorMsg && (isEmailError || isGeneralError)) ? styles.otpBoxError : null,
                      ]}
                      value={digit}
                      onChangeText={v => handleOtpInput(v, i, 'email')}
                      onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, i, 'email')}
                      maxLength={6}
                      textContentType="oneTimeCode"
                      autoComplete="sms-otp"
                      textAlign="center"
                      selectionColor={themeColors.primaryLight}
                      keyboardType="number-pad"
                      autoFocus={i === 0}
                    />
                  ))}
                </View>
              </View>

              {/* Phone OTP Inputs */}
              {hasPhone && (
                <View style={styles.otpSection}>
                  <Text style={styles.otpSectionTitle}>Phone Code sent to <Text style={styles.highlight}>{maskPhone(resolvedPhone)}</Text> via WhatsApp</Text>
                  <View style={styles.otpRow}>
                    {phoneOtp.map((digit, i) => (
                      <TextInput
                        key={`phone-${i}`}
                        ref={r => { phoneRefs.current[i] = r; }}
                        style={[
                          styles.otpBox,
                          digit ? styles.otpBoxFilled : null,
                          (errorMsg && (isPhoneError || isGeneralError)) ? styles.otpBoxError : null,
                        ]}
                        value={digit}
                        onChangeText={v => handleOtpInput(v, i, 'phone')}
                        onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, i, 'phone')}
                        maxLength={6}
                        textContentType="oneTimeCode"
                        autoComplete="sms-otp"
                        keyboardType="number-pad"
                        textAlign="center"
                      />
                    ))}
                  </View>
                </View>
              )}

              {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

              <View style={styles.resendRow}>
                {timer > 0 ? (
                  <Text style={styles.timerText}>
                    Resend codes in <Text style={{ color: themeColors.primaryLight }}>{timer}s</Text>
                  </Text>
                ) : (
                  <TouchableOpacity onPress={handleResend}>
                    <Text style={styles.resendText}>Resend OTPs →</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Button
                label="Verify & Continue →"
                onPress={handleVerifyOtp}
                variant="primary"
                fullWidth
                loading={loading}
                disabled={emailOtp.some(d => !d) || (hasPhone && phoneOtp.some(d => !d))}
              />
            </>
          )}

          {/* ── Step 3: New password ── */}
          {step === 3 && (
            <Animated.View style={[{ width: '100%', alignItems: 'center' }, { transform: [{ scale: (checkAnim as any)._value === 1 ? checkScale : 1 }] }]}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(124,58,237,0.12)', borderColor: 'rgba(124,58,237,0.3)' }]}>
                <Text style={{ fontSize: 40 }}>🔑</Text>
              </View>
              <Text style={styles.title}>Set New Password</Text>
              <Text style={styles.subtitle}>Choose a strong new password for your account.</Text>

              <Input
                label="New Password"
                icon="lock-closed-outline"
                value={newPassword}
                onChangeText={v => { setNewPassword(v); setErrorMsg(''); }}
                secureTextEntry
                containerStyle={{ width: '100%', marginBottom: 12 }}
                forceDark={isDark}
              />
              <Input
                label="Confirm Password"
                icon="checkmark-circle-outline"
                value={confirmPassword}
                onChangeText={v => { setConfirmPassword(v); setErrorMsg(''); }}
                secureTextEntry
                containerStyle={{ width: '100%', marginBottom: 12 }}
                forceDark={isDark}
              />

              {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

              <Button label="Reset Password ✓" onPress={handleResetPassword} variant="primary" fullWidth loading={loading} style={{ marginTop: 8 }} />
            </Animated.View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const getStyles = (themeColors: any, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  back: {
    marginTop: 60, marginBottom: 24,
    width: 40, height: 40, borderRadius: radii.md,
    backgroundColor: themeColors.bg.card, borderWidth: 1, borderColor: themeColors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  content: { flexGrow: 1, alignItems: 'center', paddingBottom: 40 },
  iconBox: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: themeColors.bg.card, borderWidth: 1, borderColor: themeColors.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  iconRow: { flexDirection: 'row', gap: 16, marginBottom: 20 },
  phoneIcon: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: themeColors.bg.card, borderWidth: 1, borderColor: themeColors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  phoneEmoji: { fontSize: 30 },
  title: { fontSize: fontSizes.h2, fontWeight: '800', color: themeColors.text.primary, marginBottom: 10, textAlign: 'center' },
  subtitle: { fontSize: fontSizes.md, color: themeColors.text.muted, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  highlight: { color: themeColors.primaryLight, fontWeight: '700' },
  backLink: { fontSize: fontSizes.sm, color: themeColors.primaryLight, fontWeight: '600' },
  otpSection: { width: '100%', marginBottom: 16 },
  otpSectionTitle: { fontSize: fontSizes.sm, color: themeColors.text.secondary, marginBottom: 12, textAlign: 'center' },
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  otpBox: {
    width: 42, height: 52, borderRadius: radii.md,
    backgroundColor: themeColors.bg.card, borderWidth: 1.5, borderColor: themeColors.border,
    fontSize: fontSizes.lg, fontWeight: '800', color: themeColors.text.primary,
    textAlign: 'center',
  },
  otpBoxFilled: {
    borderColor: themeColors.primary,
    backgroundColor: isDark ? 'rgba(124,58,237,0.12)' : 'rgba(124,58,237,0.08)',
    color: themeColors.primaryLight,
  },
  otpBoxError: {
    borderColor: themeColors.danger,
    backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.05)',
    color: themeColors.danger,
  },
  errorText: {
    color: themeColors.danger, fontSize: fontSizes.sm, fontWeight: '600',
    textAlign: 'center', marginBottom: 12, paddingHorizontal: 20,
  },
  resendRow: { marginTop: 8, marginBottom: 28 },
  timerText: { fontSize: fontSizes.sm, color: themeColors.text.muted },
  resendText: { fontSize: fontSizes.sm, color: themeColors.primaryLight, fontWeight: '700' },
});
