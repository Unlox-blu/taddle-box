import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ScrollView,  KeyboardAvoidingView, Platform, TextInput, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useThemeColors } from '../../context/ThemeContext';
import { fontSizes, spacing, radii } from '../../theme';
import type { HomeStackParamList } from '../../types';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { authService } from '../../services/auth.service';
import { useAuth } from '../../context/AuthContext';
import { maskEmail, maskPhone } from '../../utils/mask.util';
import { themedAlert } from '../../components/common/ThemedAlert';

type Props = NativeStackScreenProps<HomeStackParamList, 'ChangePassword'>;
const OTP_LENGTH = 6;

export default function ChangePasswordScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const { user } = useAuth();
  
  // mode: 'normal' (knows password), 'forgot-identifier' (enters details for forgot flow), 'otp-sent' (waiting for OTP), 'otp-verified' (enters new password without old one)
  const [mode, setMode] = useState<'normal' | 'forgot-identifier' | 'otp-sent' | 'otp-verified'>('normal');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [phone, setPhone] = useState('');
  
  // Forgot password flow states
  const [isForgotFlow, setIsForgotFlow] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [resolvedEmail, setResolvedEmail] = useState('');
  const [resolvedPhone, setResolvedPhone] = useState('');
  const [changeToken, setChangeToken] = useState('');

  // OTP state
  const [emailOtp, setEmailOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [phoneOtp, setPhoneOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [hasPhone, setHasPhone] = useState(false);
  const [timer, setTimer] = useState(30);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const emailRefs = useRef<(TextInput | null)[]>([]);
  const phoneRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (mode === 'otp-sent' && timer > 0) {
      const t = setTimeout(() => setTimer(v => v - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [mode, timer]);

  const handleSaveNormal = async () => {
    setError('');
    if (!currentPassword) return setError('Current password is required');
    if (!email) return setError('Registered email is required');

    try {
      setLoading(true);
      const res = await authService.changePassword({ currentPassword, email, countryCode, phone });
      setHasPhone(!!res?.data?.hasPhone || !!res?.hasPhone);
      const resolvedPhoneVar = res.data?.phone || res.phone || '';
      setResolvedPhone(resolvedPhoneVar);
      setResolvedEmail(res.data?.email || res.email || user?.email || '');
      setIsForgotFlow(false);
      setMode('otp-sent');
      setTimer(30);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to change password. Please check your current password.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotTrigger = () => {
    setError('');
    setIsForgotFlow(true);
    setIdentifier(user?.email || '');
    setMode('forgot-identifier');
  };

  const handleForgotSubmit = async () => {
    if (!identifier.trim()) {
      setError('Please enter your email, phone number or username');
      return;
    }
    setError('');
    try {
      setLoading(true);
      const res = await authService.forgotPassword(identifier.toLowerCase().trim());
      const resolved = res.data?.email || res.email || '';
      setResolvedEmail(resolved);
      const phone = res.data?.phone || res.phone || '';
      setResolvedPhone(phone);
      setHasPhone(!!res?.data?.hasPhone || !!res?.hasPhone);
      setMode('otp-sent');
      setTimer(30);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to send OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (timer > 0) return;
    try {
      if (isForgotFlow) {
        await authService.forgotPassword(identifier.toLowerCase().trim() || user?.email || '');
      } else {
        await authService.changePassword({ currentPassword, email, countryCode, phone });
      }
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
    setError('');
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
        if (isEmail && hasPhone) phoneRefs.current[0]?.focus();
        else activeRefs.current[OTP_LENGTH - 1]?.blur();
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
        const nextEmail = [...emailOtp];
        nextEmail[OTP_LENGTH - 1] = '';
        setEmailOtp(nextEmail);
        emailRefs.current[OTP_LENGTH - 1]?.focus();
      }
    }
  };

  const handleVerifyOtp = async () => {
    if (emailOtp.join('').length < OTP_LENGTH || (hasPhone && phoneOtp.join('').length < OTP_LENGTH)) {
      setError('Please enter the complete 6-digit OTPs');
      return;
    }
    setError('');
    try {
      setLoading(true);
      if (isForgotFlow) {
        const res = await authService.verifyResetPasswordOtp({
          email: resolvedEmail,
          emailOtp: emailOtp.join(''),
          phoneOtp: hasPhone ? phoneOtp.join('') : undefined,
        });
        setChangeToken(res.data?.token || res.token);
      } else {
        const res = await authService.verifyChangePasswordOtp({
          emailOtp: emailOtp.join(''),
          phoneOtp: hasPhone ? phoneOtp.join('') : undefined,
        });
        setChangeToken(res.data?.changeToken || res.changeToken);
      }
      setMode('otp-verified');
    } catch (e: any) {
      setError(e.response?.data?.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveReset = async () => {
    if (!resolvedEmail) return;
    setError('');
    if (newPassword.length < 8) return setError('New password must be at least 8 characters');
    if (!/[a-z]/.test(newPassword)) return setError('New password must contain at least one lowercase letter');
    if (!/[A-Z]/.test(newPassword)) return setError('New password must contain at least one uppercase letter');
    if (!/[0-9]/.test(newPassword)) return setError('New password must contain at least one number');
    if (newPassword !== confirmPassword) return setError('New passwords do not match');

    try {
      setLoading(true);
      if (isForgotFlow) {
        await authService.resetPassword({
          token: changeToken,
          password: newPassword,
        });
      } else {
        await authService.confirmChangePassword({
          changeToken,
          newPassword,
        });
      }
      themedAlert('Success', 'Your password has been reset successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (e: any) {
      const msg = e.response?.data?.message || 'Failed to reset password.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const isEmailError = error.toLowerCase().includes('email');
  const isPhoneError = error.toLowerCase().includes('phone');
  const isGeneralError = !isEmailError && !isPhoneError && !!error;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg.base }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => (mode === 'normal' || mode === 'forgot-identifier') ? (mode === 'forgot-identifier' ? setMode('normal') : navigation.goBack()) : setMode('normal')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text.primary }]}>Change Password</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {mode === 'normal' && (
            <>
              <Input
                label="Current Password"
                value={currentPassword}
                onChangeText={(text) => { setCurrentPassword(text); setError(''); }}
                icon="lock-closed-outline"
                secureTextEntry
                containerStyle={styles.inputContainer}
              />
              <Input
                label="Registered Email Address"
                value={email}
                onChangeText={(text) => { setEmail(text); setError(''); }}
                icon="mail-outline"
                autoCapitalize="none"
                keyboardType="email-address"
                containerStyle={styles.inputContainer}
              />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 0.3 }}>
                  <Input
                    label="Code"
                    value={countryCode}
                    onChangeText={setCountryCode}
                    keyboardType="phone-pad"
                    containerStyle={styles.inputContainer}
                  />
                </View>
                <View style={{ flex: 0.7 }}>
                  <Input
                    label="Registered Phone"
                    value={phone}
                    onChangeText={(text) => { setPhone(text); setError(''); }}
                    keyboardType="phone-pad"
                    containerStyle={styles.inputContainer}
                  />
                </View>
              </View>
              <TouchableOpacity onPress={handleForgotTrigger} style={styles.forgotBtn} disabled={loading}>
                <Text style={[styles.forgotText, { color: colors.primary }]}>I forgot my old password</Text>
              </TouchableOpacity>

              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

              <Button 
                label="Verify Details" 
                onPress={handleSaveNormal} 
                variant="primary" 
                fullWidth 
                loading={loading}
                style={styles.saveBtn} 
              />
            </>
          )}

          {mode === 'forgot-identifier' && (
            <View style={{ width: '100%' }}>
              <Text style={[styles.otpTitle, { color: colors.text.primary }]}>Find your account</Text>
              <Text style={[styles.otpSubtitle, { color: colors.text.muted }]}>
                Enter your email, phone number, or username linked to your account to receive OTP codes.
              </Text>
              <Input
                label="Email, Phone or Username"
                value={identifier}
                onChangeText={(text) => { setIdentifier(text); setError(''); }}
                icon="person-outline"
                autoCapitalize="none"
                containerStyle={styles.inputContainer}
              />
              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
              <Button 
                label="Send Verification OTPs →" 
                onPress={handleForgotSubmit} 
                variant="primary" 
                fullWidth 
                loading={loading}
                style={styles.saveBtn} 
              />
            </View>
          )}

          {mode === 'otp-sent' && (
            <View style={{ alignItems: 'center' }}>
              <View style={styles.iconRow}>
                <View style={[styles.phoneIcon, { backgroundColor: colors.bg.card, borderColor: colors.border }]}>
                  <Text style={styles.phoneEmoji}>✉️</Text>
                </View>
                {hasPhone && (
                  <View style={[styles.phoneIcon, { backgroundColor: colors.bg.card, borderColor: colors.border }]}>
                    <Text style={styles.phoneEmoji}>📱</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.otpTitle, { color: colors.text.primary }]}>Verify your Identity</Text>
              <Text style={[styles.otpSubtitle, { color: colors.text.muted }]}>
                We sent 6-digit codes to your {hasPhone ? 'email and phone' : 'email'}.
              </Text>

              {/* Email OTP Inputs */}
              <View style={styles.otpSection}>
                <Text style={[styles.otpSectionTitle, { color: colors.text.secondary }]}>Email Code sent to <Text style={{ color: colors.primaryLight, fontWeight: '700' }}>{maskEmail(resolvedEmail || user?.email || '')}</Text></Text>
                <View style={styles.otpRow}>
                  {emailOtp.map((digit, i) => (
                    <TextInput
                      key={`email-${i}`}
                      ref={r => { emailRefs.current[i] = r; }}
                      style={[
                        styles.otpBox,
                        { backgroundColor: colors.bg.card, borderColor: colors.border, color: colors.text.primary },
                        digit ? { borderColor: colors.primary, backgroundColor: 'rgba(124,58,237,0.12)', color: colors.primaryLight } : null,
                        (error && (isEmailError || isGeneralError)) ? { borderColor: colors.danger, backgroundColor: 'rgba(239,68,68,0.08)', color: colors.danger } : null,
                      ]}
                      value={digit}
                      onChangeText={v => handleOtpInput(v, i, 'email')}
                      onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, i, 'email')}
                      maxLength={6}
                      textContentType="oneTimeCode"
                      autoComplete="sms-otp"
                      keyboardType="number-pad"
                      textAlign="center"
                      selectionColor={colors.primaryLight}
                      autoFocus={i === 0}
                    />
                  ))}
                </View>
              </View>

              {/* Phone OTP Inputs */}
              {hasPhone && (
                <View style={styles.otpSection}>
                  <Text style={[styles.otpSectionTitle, { color: colors.text.secondary }]}>Phone Code sent to <Text style={{ color: colors.primaryLight, fontWeight: '700' }}>{maskPhone(resolvedPhone)}</Text> via WhatsApp</Text>
                  <View style={styles.otpRow}>
                    {phoneOtp.map((digit, i) => (
                      <TextInput
                        key={`phone-${i}`}
                        ref={r => { phoneRefs.current[i] = r; }}
                        style={[
                          styles.otpBox,
                          { backgroundColor: colors.bg.card, borderColor: colors.border, color: colors.text.primary },
                          digit ? { borderColor: colors.primary, backgroundColor: 'rgba(124,58,237,0.12)', color: colors.primaryLight } : null,
                          (error && (isPhoneError || isGeneralError)) ? { borderColor: colors.danger, backgroundColor: 'rgba(239,68,68,0.08)', color: colors.danger } : null,
                        ]}
                        value={digit}
                        onChangeText={v => handleOtpInput(v, i, 'phone')}
                        onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, i, 'phone')}
                        maxLength={6}
                        textContentType="oneTimeCode"
                        autoComplete="sms-otp"
                        keyboardType="number-pad"
                        textAlign="center"
                        selectionColor={colors.primaryLight}
                      />
                    ))}
                  </View>
                </View>
              )}

              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

              <View style={styles.resendRow}>
                {timer > 0 ? (
                  <Text style={[styles.timerText, { color: colors.text.muted }]}>
                    Resend codes in <Text style={{ color: colors.primaryLight }}>{timer}s</Text>
                  </Text>
                ) : (
                  <TouchableOpacity onPress={handleResendOtp}>
                    <Text style={[styles.resendText, { color: colors.primaryLight }]}>Resend OTPs →</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Button
                label="Verify & Continue →"
                onPress={handleVerifyOtp}
                variant="primary"
                fullWidth
                disabled={emailOtp.some(d => !d) || (hasPhone && phoneOtp.some(d => !d))}
              />
            </View>
          )}

          {mode === 'otp-verified' && (
            <View style={{ alignItems: 'center', width: '100%' }}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(124,58,237,0.12)', borderColor: 'rgba(124,58,237,0.3)' }]}>
                <Text style={{ fontSize: 40 }}>🔑</Text>
              </View>
              <Text style={[styles.otpTitle, { color: colors.text.primary }]}>Set New Password</Text>
              <Text style={[styles.otpSubtitle, { color: colors.text.muted }]}>Choose a strong new password for your account.</Text>

              <Input
                label="New Password"
                value={newPassword}
                onChangeText={(text) => { setNewPassword(text); setError(''); }}
                icon="key-outline"
                secureTextEntry
                containerStyle={styles.inputContainer}
              />
              <Input
                label="Confirm New Password"
                value={confirmPassword}
                onChangeText={(text) => { setConfirmPassword(text); setError(''); }}
                icon="checkmark-circle-outline"
                secureTextEntry
                containerStyle={styles.inputContainer}
              />

              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

              <Button 
                label="Reset Password ✓" 
                onPress={handleSaveReset} 
                variant="primary" 
                fullWidth 
                loading={loading}
                style={styles.saveBtn} 
              />
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: spacing.xs,
  },
  title: {
    fontSize: fontSizes.lg,
    fontWeight: '600',
  },
  content: {
    padding: spacing.xl,
  },
  inputContainer: {
    width: '100%',
    marginBottom: spacing.md,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginBottom: spacing.xl,
    marginTop: -spacing.sm,
  },
  forgotText: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },
  error: {
    fontSize: fontSizes.sm,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  saveBtn: {
    marginTop: spacing.xl,
    width: '100%',
  },
  iconBox: {
    width: 80, height: 80, borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  iconRow: { flexDirection: 'row', gap: 16, marginBottom: 20 },
  phoneIcon: {
    width: 64, height: 64, borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  phoneEmoji: { fontSize: 30 },
  otpTitle: { fontSize: fontSizes.h2, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  otpSubtitle: { fontSize: fontSizes.md, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  otpSection: { width: '100%', marginBottom: 16 },
  otpSectionTitle: { fontSize: fontSizes.sm, marginBottom: 12, textAlign: 'center' },
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  otpBox: {
    width: 42, height: 52, borderRadius: radii.md,
    borderWidth: 1.5,
    fontSize: fontSizes.lg, fontWeight: '800',
  },
  resendRow: { marginTop: 8, marginBottom: 28 },
  timerText: { fontSize: fontSizes.sm },
  resendText: { fontSize: fontSizes.sm, fontWeight: '700' },
});
