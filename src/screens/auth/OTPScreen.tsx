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

const OTP_LENGTH = 6;
type Props = NativeStackScreenProps<AuthStackParamList, 'OTP'>;

export default function OTPScreen({ navigation, route }: Props) {
  const { signIn } = useAuth();
  const [otp, setOtp]           = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading]   = useState(false);
  const [verified, setVerified] = useState(false);
  const [timer, setTimer]       = useState(30);
  const refs = useRef<(TextInput | null)[]>([]);
  const checkAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (timer <= 0) return;
    const t = setTimeout(() => setTimer(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [timer]);

  const handleInput = (val: string, idx: number) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp];
    next[idx] = val.slice(-1);
    setOtp(next);
    if (val && idx < OTP_LENGTH - 1) refs.current[idx + 1]?.focus();
    if (next.every(d => d !== '') && next.join('').length === OTP_LENGTH) {
      handleVerify(next.join(''));
    }
  };

  const handleKeyPress = (key: string, idx: number) => {
    if (key === 'Backspace' && !otp[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
  };

  const handleVerify = async (code: string) => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    setLoading(false);
    setVerified(true);
    Animated.spring(checkAnim, { toValue: 1, useNativeDriver: true, tension: 50 }).start();
    setTimeout(() => {
      signIn();
    }, 1200);
  };

  const checkScale = checkAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <LinearGradient colors={['#070714', '#0E0E24']} style={styles.container}>
      <StatusBar style="light" />

      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
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
              <Text style={styles.phoneEmoji}>📱</Text>
            </View>
            <Text style={styles.title}>Verify your number</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to{'\n'}
              <Text style={styles.phone}>{route.params.phone}</Text>
            </Text>

            {/* OTP Inputs */}
            <View style={styles.otpRow}>
              {otp.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={r => { refs.current[i] = r; }}
                  style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                  value={digit}
                  onChangeText={v => handleInput(v, i)}
                  onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
                  maxLength={1}
                  keyboardType="number-pad"
                  textAlign="center"
                />
              ))}
            </View>

            {/* Resend */}
            <View style={styles.resendRow}>
              {timer > 0 ? (
                <Text style={styles.timerText}>Resend in <Text style={{ color: colors.primaryLight }}>{timer}s</Text></Text>
              ) : (
                <TouchableOpacity onPress={() => setTimer(30)}>
                  <Text style={styles.resendText}>Resend OTP →</Text>
                </TouchableOpacity>
              )}
            </View>

            <Button
              label="Verify & Continue →"
              onPress={() => handleVerify(otp.join(''))}
              variant="primary"
              fullWidth
              loading={loading}
              disabled={otp.some(d => !d)}
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
