import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, fontSizes } from '../../theme';
import Button from '../../components/common/Button';
import Input  from '../../components/common/Input';
import type { AuthStackParamList } from '../../types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);

  const handleSend = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 1100));
    setLoading(false);
    setSent(true);
  };

  return (
    <LinearGradient colors={['#070714', '#0E0E24']} style={styles.container}>
      <StatusBar style="light" />
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
        <Ionicons name="arrow-back" size={22} color={colors.text.secondary} />
      </TouchableOpacity>

      {!sent ? (
        <View style={styles.content}>
          <View style={styles.iconBox}>
            <Text style={{ fontSize: 40 }}>🔐</Text>
          </View>
          <Text style={styles.title}>Forgot Password?</Text>
          <Text style={styles.subtitle}>Enter your email and we'll send you a reset link.</Text>
          <Input
            label="Email Address"
            icon="mail-outline"
            value={email}
            onChangeText={setEmail}
            placeholder="arjun@iitd.ac.in"
            keyboardType="email-address"
            autoCapitalize="none"
            containerStyle={{ width: '100%' }}
          />
          <Button label="Send Reset Link" onPress={handleSend} variant="primary" fullWidth loading={loading} style={{ marginTop: 12 }} />
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
            <Text style={styles.backLink}>← Back to Login</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.content}>
          <View style={[styles.iconBox, { backgroundColor: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.28)' }]}>
            <Text style={{ fontSize: 40 }}>📧</Text>
          </View>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>We sent a reset link to <Text style={{ color: colors.primaryLight }}>{email}</Text></Text>
          <Button label="Back to Login" onPress={() => navigation.navigate('Login')} variant="ghost" fullWidth style={{ marginTop: 24 }} />
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  back: {
    marginTop: 60, marginBottom: 24,
    width: 40, height: 40, borderRadius: radii.md,
    backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  content: { flex: 1, alignItems: 'center', paddingTop: 20 },
  iconBox: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  title: { fontSize: fontSizes.h2, fontWeight: '800', color: colors.text.primary, marginBottom: 10, textAlign: 'center' },
  subtitle: { fontSize: fontSizes.md, color: colors.text.muted, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  backLink: { fontSize: fontSizes.sm, color: colors.primaryLight, fontWeight: '600' },
});
