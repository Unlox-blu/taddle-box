import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, fontSizes, spacing } from '../../theme';
import Button from '../../components/common/Button';
import type { AuthStackParamList } from '../../types';

const { height } = Dimensions.get('window');
type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

export default function WelcomeScreen({ navigation }: Props) {
  return (
    <LinearGradient colors={['#070714', '#0f0a2e']} style={styles.container}>
      <StatusBar style="light" />

      {/* Background glow */}
      <View style={styles.glow} />

      {/* Logo */}
      <View style={styles.logoSection}>
        <LinearGradient
          colors={[colors.primary, colors.cyanDark]}
          style={styles.iconBox}
        >
          <Text style={styles.iconEmoji}>⚡</Text>
        </LinearGradient>
        <Text style={styles.brand}>
          <Text style={styles.brandW}>TADDL</Text>
          <Text style={styles.brandG}>EBOX</Text>
        </Text>
        <Text style={styles.tagline}>Your campus. Gamified.</Text>
      </View>

      {/* Feature highlights */}
      <View style={styles.features}>
        {[
          { icon: 'trophy',           text: 'Earn XP & real cash rewards'     },
          { icon: 'game-controller',  text: 'Play games & climb leaderboards' },
          { icon: 'people',           text: 'Join 100k+ student communities'  },
          { icon: 'calendar',         text: 'Attend events & hackathons'       },
        ].map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Ionicons name={f.icon as any} size={16} color={colors.primaryLight} />
            </View>
            <Text style={styles.featureText}>{f.text}</Text>
          </View>
        ))}
      </View>

      {/* CTA buttons */}
      <View style={styles.actions}>
        <Button
          label="Create Account"
          onPress={() => navigation.navigate('Register')}
          variant="primary"
          fullWidth
          leftEmoji="🚀"
        />
        <Button
          label="Log In"
          onPress={() => navigation.navigate('Login')}
          variant="ghost"
          fullWidth
          style={{ marginTop: 12 }}
        />

        {/* Social logins */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or continue with</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.socialRow}>
          <TouchableOpacity style={styles.socialBtn}>
            <Text style={styles.socialIcon}>G</Text>
            <Text style={styles.socialLabel}>Google</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.socialBtn}>
            <Ionicons name="logo-apple" size={18} color={colors.text.primary} />
            <Text style={styles.socialLabel}>Apple</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.terms}>
          By continuing you agree to our{' '}
          <Text style={{ color: colors.primaryLight }}>Terms</Text>
          {' '}and{' '}
          <Text style={{ color: colors.primaryLight }}>Privacy Policy</Text>
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  glow: {
    position: 'absolute',
    width: 360, height: 360,
    borderRadius: 180,
    backgroundColor: 'rgba(124,58,237,0.1)',
    top: height * 0.1,
    alignSelf: 'center',
  },
  logoSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  iconBox: {
    width: 80, height: 80,
    borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 10,
  },
  iconEmoji: { fontSize: 40 },
  brand: { fontSize: fontSizes.display - 6, fontWeight: '800', letterSpacing: -1 },
  brandW: { color: '#fff' },
  brandG: { color: colors.primaryLight },
  tagline: {
    fontSize: fontSizes.md,
    color: colors.text.muted,
    marginTop: 6,
    letterSpacing: 0.3,
  },
  features: {
    gap: 10,
    marginBottom: 28,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIcon: {
    width: 32, height: 32,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(124,58,237,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  featureText: { fontSize: fontSizes.sm, color: colors.text.secondary },
  actions: { paddingBottom: 40 },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 20,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: fontSizes.xs, color: colors.text.muted },
  socialRow: { flexDirection: 'row', gap: 12 },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.borderHover,
    borderRadius: radii.md,
    paddingVertical: 12,
  },
  socialIcon: {
    fontSize: fontSizes.md,
    fontWeight: '800',
    color: colors.text.primary,
  },
  socialLabel: { fontSize: fontSizes.sm, color: colors.text.primary, fontWeight: '600' },
  terms: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: 18,
    lineHeight: 18,
  },
});
