import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Animated, Dimensions, KeyboardAvoidingView, Platform, ScrollView, Image
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { radii, fontSizes, spacing } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import Button from '../../components/common/Button';
import type { AuthStackParamList } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/auth.service';
import { getReferralRewards } from '../../services/appConfig.service';

interface ReferrerInfo {
  id?: string;
  name?: string;
  username?: string;
  avatarUrl?: string;
}

const OTP_LENGTH = 6;
type Props = NativeStackScreenProps<AuthStackParamList, 'OTP'>;

export default function OTPScreen({ navigation, route }: Props) {
  const { colors: themeColors, isDark } = useTheme();
  const styles = React.useMemo(() => getStyles(themeColors, isDark), [themeColors, isDark]);
  const { signIn } = useAuth();
  
  // @ts-ignore
  const signupData = route.params?.signupData || {};
  // @ts-ignore
  const verificationToken = route.params?.verificationToken;

  const isSocialSignup = !!signupData.socialToken;

  const [emailOtp, setEmailOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [phoneOtp, setPhoneOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  
  const [loading, setLoading]   = useState(false);
  const [verified, setVerified] = useState(false);
  const [timer, setTimer]       = useState(30);
  const [errorMsg, setErrorMsg] = useState('');
  const [referrer, setReferrer] = useState<ReferrerInfo | null>(null);
  const [welcomeName, setWelcomeName] = useState('');
  const [referralXp, setReferralXp] = useState<number | null>(null);
  
  const emailRefs = useRef<(TextInput | null)[]>([]);
  const phoneRefs = useRef<(TextInput | null)[]>([]);
  const checkAnim = useRef(new Animated.Value(0)).current;
  const giftAnim = useRef(new Animated.Value(0)).current;

  // Reset state
  useEffect(() => {
    setEmailOtp(Array(OTP_LENGTH).fill(''));
    setPhoneOtp(Array(OTP_LENGTH).fill(''));
    setTimer(30);
    setVerified(false);
    setErrorMsg('');
  }, [signupData.email, signupData.phone]);

  useEffect(() => {
    if (timer <= 0) return;
    const t = setTimeout(() => setTimer(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [timer]);

  const handleInput = (val: string, idx: number, type: 'email' | 'phone') => {
    if (!/^\d*$/.test(val)) return;
    setErrorMsg('');
    const isEmail = type === 'email';
    const activeOtp = isEmail ? emailOtp : phoneOtp;
    const setActiveOtp = isEmail ? setEmailOtp : setPhoneOtp;
    const activeRefs = isEmail ? emailRefs : phoneRefs;

    let next = [...activeOtp];

    // Handle auto-fill or pasting multiple characters
    if (val.length > 1) {
      const cleaned = val.replace(/\D/g, '');
      for (let i = 0; i < cleaned.length; i++) {
        if (idx + i < OTP_LENGTH) {
          next[idx + i] = cleaned[i];
        }
      }
      setActiveOtp(next);

      if (idx + cleaned.length >= OTP_LENGTH) {
        if (isEmail && !isSocialSignup) {
          phoneRefs.current[0]?.focus();
        } else {
          activeRefs.current[OTP_LENGTH - 1]?.blur();
        }
      } else {
        activeRefs.current[idx + cleaned.length]?.focus();
      }
    } else {
      // Normal single character or backspace
      next[idx] = val;
      setActiveOtp(next);

      if (val && idx < OTP_LENGTH - 1) {
        activeRefs.current[idx + 1]?.focus();
      } else if (val && idx === OTP_LENGTH - 1 && isEmail && !isSocialSignup) {
        phoneRefs.current[0]?.focus();
      }
    }
  };

  const handleKeyPress = (key: string, idx: number, type: 'email' | 'phone') => {
    const isEmail = type === 'email';
    const activeOtp = isEmail ? emailOtp : phoneOtp;
    const setActiveOtp = isEmail ? setEmailOtp : setPhoneOtp;
    const activeRefs = isEmail ? emailRefs : phoneRefs;

    if (key === 'Backspace') {
      if (!activeOtp[idx] && idx > 0) {
        // If current is empty, focus previous and clear it
        const next = [...activeOtp];
        next[idx - 1] = '';
        setActiveOtp(next);
        activeRefs.current[idx - 1]?.focus();
      } else if (!activeOtp[idx] && idx === 0 && !isEmail && !isSocialSignup) {
        // If first phone digit is empty, jump to last email digit and clear it
        const nextEmail = [...emailOtp];
        nextEmail[OTP_LENGTH - 1] = '';
        setEmailOtp(nextEmail);
        emailRefs.current[OTP_LENGTH - 1]?.focus();
      }
    }
  };

  const handleVerify = async (eCodeOverride?: string, pCodeOverride?: string) => {
    setLoading(true);
    try {
      const eCode = eCodeOverride || (isSocialSignup ? '000000' : emailOtp.join(''));
      const pCode = pCodeOverride || phoneOtp.join('');

      // 1. Verify both OTPs
      await authService.verifyOtp({ emailOtp: eCode, phoneOtp: pCode }, verificationToken);

      // 2. Signup user
      const res = await authService.signup(signupData, verificationToken);
      
      setVerified(true);
      Animated.spring(checkAnim, { toValue: 1, useNativeDriver: true, tension: 50 }).start();

      // Welcome-screen data: the referrer (if a referral code was used) and
      // the backend-controlled joiner reward amount.
      const payload = res.data || res;
      const ref = (payload as any)?.referrer;
      setReferrer(ref?.username ? ref : null);
      setWelcomeName((payload as any)?.user?.name || signupData.name || '');
      if (ref?.username) {
        getReferralRewards()
          .then((r) => {
            const xp = r?.joinerXp ?? null;
            setReferralXp(xp);
            if (xp != null) {
              Animated.sequence([
                Animated.spring(giftAnim, { toValue: 1, useNativeDriver: true, friction: 3, tension: 90 }),
                Animated.timing(giftAnim, { toValue: 0, useNativeDriver: true, duration: 350 }),
                Animated.spring(giftAnim, { toValue: 1, useNativeDriver: true, friction: 4, tension: 80 }),
              ]).start();
            }
          })
          .catch(() => {});
      }
      
      const accessToken = res.data?.sessionData?.accessToken || res.sessionData?.accessToken || res.data?.accessToken;
      const refreshToken = res.data?.sessionData?.refreshToken || res.sessionData?.refreshToken || res.data?.refreshToken;
      
      setTimeout(() => {
        signIn(accessToken, refreshToken);
      }, 1200);

    } catch (e: any) {
      console.log('OTP Verify Error:', JSON.stringify(e.response?.data, null, 2));
      const errors = e.response?.data?.errors;
      const errMsg = errors ? JSON.stringify(errors) : (e.response?.data?.message || e.message);
      
      setErrorMsg(errMsg || 'Verification failed');
      
      if (errMsg && errMsg.toLowerCase().includes('email')) {
        setEmailOtp(Array(OTP_LENGTH).fill(''));
        emailRefs.current[0]?.focus();
      } else {
        setPhoneOtp(Array(OTP_LENGTH).fill(''));
        phoneRefs.current[0]?.focus();
      }
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
        phone: signupData.phone,
        socialToken: signupData.socialToken
      });
    } catch (e) {
      // Ignore
    }
  };

  const checkScale = checkAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  const isVerifyDisabled = isSocialSignup 
    ? phoneOtp.some(d => !d) 
    : (emailOtp.some(d => !d) || phoneOtp.some(d => !d));

  const isEmailError = errorMsg.toLowerCase().includes('email');
  const isPhoneError = errorMsg.toLowerCase().includes('phone');
  const isGeneralError = !isEmailError && !isPhoneError && !!errorMsg;

  return (
    <LinearGradient colors={[themeColors.bg.base, themeColors.bg.surface]} style={styles.container}>
      <StatusBar style={isDark ? "light" : "dark"} />

      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
        <Ionicons name="arrow-back" size={22} color={themeColors.text.secondary} />
      </TouchableOpacity>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {verified ? (
            <Animated.View style={[styles.successWrap, { transform: [{ scale: checkScale }] }]}>
              <Text style={styles.successEyebrow}>Welcome to TaddleBox</Text>
              <Text style={styles.successText}>
                {welcomeName ? `Hey, ${welcomeName.split(' ')[0]}! 👋` : 'You\'re in! 🎉'}
              </Text>

              {referrer ? (
                <>
                  <Animated.View
                    style={{
                      transform: [
                        {
                          rotate: giftAnim.interpolate({
                            inputRange: [0, 0.25, 0.5, 0.75, 1],
                            outputRange: ['0deg', '-12deg', '8deg', '-6deg', '0deg'],
                          }),
                        },
                        {
                          scale: giftAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.12],
                          }),
                        },
                      ],
                    }}
                  >
                    <LinearGradient colors={[themeColors.primary, themeColors.primaryDark]} style={styles.giftBox}>
                      <Ionicons name="gift" size={46} color="#fff" />
                      <View style={styles.giftRibbon} />
                    </LinearGradient>
                  </Animated.View>

                  <View style={styles.referralCard}>
                    <View style={styles.referrerAvatar}>
                      {referrer.avatarUrl ? (
                        <Image source={{ uri: referrer.avatarUrl }} style={styles.referrerAvatarImg} />
                      ) : (
                        <Text style={styles.referrerAvatarEmoji}>🎁</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.referralCardTitle}>
                        {referralXp != null ? `+${referralXp} XP bonus unlocked!` : 'Referral bonus unlocked!'}
                      </Text>
                      <Text style={styles.referralCardSub}>
                        Gift from <Text style={styles.referralCardName}>{referrer.name || `@${referrer.username}`}</Text>
                        {referrer.username && referrer.name ? ` (@${referrer.username})` : ''}
                      </Text>
                    </View>
                  </View>
                </>
              ) : (
                <LinearGradient colors={[themeColors.success, '#059669']} style={styles.successCircle}>
                  <Ionicons name="checkmark" size={44} color="#fff" />
                </LinearGradient>
              )}

              <Text style={styles.successSub}>
                {referrer
                  ? 'Your account is ready — explore, post and start earning!'
                  : 'Your account is verified. Let\'s get started!'}
              </Text>
            </Animated.View>
          ) : (
            <>
              <View style={styles.iconRow}>
                {!isSocialSignup && (
                  <View style={styles.phoneIcon}>
                    <Text style={styles.phoneEmoji}>✉️</Text>
                  </View>
                )}
                <View style={styles.phoneIcon}>
                  <Text style={styles.phoneEmoji}>📱</Text>
                </View>
              </View>
              <Text style={styles.title}>
                Verify your Account
              </Text>
              <Text style={styles.subtitle}>
                We sent 6-digit codes to your {isSocialSignup ? 'phone' : 'email and phone'}.
              </Text>

              {!isSocialSignup && (
                <View style={styles.otpSection}>
                  <Text style={styles.otpSectionTitle}>Email Code sent to <Text style={styles.highlight}>{signupData.email}</Text></Text>
                  <View style={styles.otpRow}>
                    {emailOtp.map((digit, i) => (
                      <TextInput
                        key={`email-${i}`}
                        ref={r => { emailRefs.current[i] = r; }}
                        style={[
                          styles.otpBox, 
                          digit ? styles.otpBoxFilled : null,
                          (errorMsg && (isEmailError || isGeneralError)) ? styles.otpBoxError : null
                        ]}
                        value={digit}
                        onChangeText={v => handleInput(v, i, 'email')}
                        onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i, 'email')}
                        maxLength={6}
                        textContentType="oneTimeCode"
                        autoComplete="sms-otp"
                        keyboardType="number-pad"
                        textAlign="center"
                        autoFocus={i === 0}
                      />
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.otpSection}>
                <Text style={styles.otpSectionTitle}>Phone Code sent to <Text style={styles.highlight}>{signupData.phone}</Text></Text>
                <View style={styles.otpRow}>
                  {phoneOtp.map((digit, i) => (
                    <TextInput
                      key={`phone-${i}`}
                      ref={r => { phoneRefs.current[i] = r; }}
                      style={[
                        styles.otpBox, 
                        digit ? styles.otpBoxFilled : null,
                        (errorMsg && (isPhoneError || isGeneralError)) ? styles.otpBoxError : null
                      ]}
                      value={digit}
                      onChangeText={v => handleInput(v, i, 'phone')}
                      onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i, 'phone')}
                      maxLength={6}
                      textContentType="oneTimeCode"
                      autoComplete="sms-otp"
                      keyboardType="number-pad"
                      textAlign="center"
                      autoFocus={isSocialSignup && i === 0}
                    />
                  ))}
                </View>
              </View>

              {errorMsg ? (
                <Text style={styles.errorText}>{errorMsg}</Text>
              ) : null}

              <View style={styles.resendRow}>
                {timer > 0 ? (
                  <Text style={styles.timerText}>Resend codes in <Text style={{ color: themeColors.primaryLight }}>{timer}s</Text></Text>
                ) : (
                  <TouchableOpacity onPress={handleResend}>
                    <Text style={styles.resendText}>{isSocialSignup ? 'Resend OTP' : 'Resend OTPs'} →</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Button
                label="Verify & Complete →"
                onPress={() => handleVerify()}
                variant="primary"
                fullWidth
                loading={loading}
                disabled={isVerifyDisabled}
              />
            </>
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
    backgroundColor: themeColors.bg.card,
    borderWidth: 1, borderColor: themeColors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  content: { flexGrow: 1, alignItems: 'center', paddingBottom: 140 },
  iconRow: { flexDirection: 'row', gap: 16, marginBottom: 20 },
  phoneIcon: {
    width: 64, height: 64,
    borderRadius: 20,
    backgroundColor: themeColors.bg.card,
    borderWidth: 1, borderColor: themeColors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  phoneEmoji: { fontSize: 30 },
  title: { fontSize: fontSizes.h2, fontWeight: '800', color: themeColors.text.primary, marginBottom: 8 },
  subtitle: { fontSize: fontSizes.md, color: themeColors.text.muted, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  highlight: { color: themeColors.primaryLight, fontWeight: '700' },
  otpSection: { width: '100%', marginBottom: 24 },
  otpSectionTitle: { fontSize: fontSizes.sm, color: themeColors.text.secondary, marginBottom: 12, textAlign: 'center' },
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  otpBox: {
    width: 42, height: 52,
    borderRadius: radii.md,
    backgroundColor: themeColors.bg.card,
    borderWidth: 1.5,
    borderColor: themeColors.border,
    fontSize: fontSizes.lg,
    fontWeight: '800',
    color: themeColors.text.primary,
  },
  otpBoxFilled: {
    borderColor: themeColors.primary,
    backgroundColor: 'rgba(124,58,237,0.12)',
    color: themeColors.primaryLight,
  },
  otpBoxError: {
    borderColor: themeColors.danger,
    backgroundColor: 'rgba(239,68,68,0.08)',
    color: themeColors.danger,
  },
  errorText: {
    color: themeColors.danger,
    fontSize: fontSizes.sm,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  resendRow: { marginTop: 10, marginBottom: 28 },
  timerText: { fontSize: fontSizes.sm, color: themeColors.text.muted },
  resendText: { fontSize: fontSizes.sm, color: themeColors.primaryLight, fontWeight: '700' },
  successWrap: { alignItems: 'center', gap: 16, paddingTop: 60, paddingHorizontal: 24 },
  successEyebrow: {
    fontSize: fontSizes.xs, fontWeight: '700', color: themeColors.primaryLight,
    textTransform: 'uppercase', letterSpacing: 1.5,
  },
  successCircle: {
    width: 100, height: 100,
    borderRadius: 50,
    alignItems: 'center', justifyContent: 'center',
  },
  successText: { fontSize: fontSizes.xxl, fontWeight: '800', color: themeColors.text.primary, textAlign: 'center' },
  successSub: {
    fontSize: fontSizes.sm, color: themeColors.text.muted, textAlign: 'center', lineHeight: 20,
  },
  giftBox: {
    width: 110, height: 110, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8, overflow: 'hidden',
    shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 10,
  },
  giftRibbon: {
    position: 'absolute', top: 0, bottom: 0, width: 26,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  referralCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: themeColors.bg.card, borderWidth: 1, borderColor: themeColors.border,
    borderRadius: radii.lg, padding: 14, marginTop: 4,
    width: '100%', maxWidth: 340,
  },
  referrerAvatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: themeColors.bg.elevated, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  referrerAvatarImg: { width: 46, height: 46, borderRadius: 23 },
  referrerAvatarEmoji: { fontSize: 20 },
  referralCardTitle: {
    fontSize: fontSizes.sm, fontWeight: '800', color: themeColors.xpGold,
  },
  referralCardSub: {
    fontSize: fontSizes.xs, color: themeColors.text.secondary, marginTop: 3, lineHeight: 17,
  },
  referralCardName: { color: themeColors.primaryLight, fontWeight: '700' },
});
