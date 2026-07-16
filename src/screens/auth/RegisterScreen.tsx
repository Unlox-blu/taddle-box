import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, fontSizes, spacing } from '../../theme';
import Button from '../../components/common/Button';
import Input  from '../../components/common/Input';
import type { AuthStackParamList } from '../../types';
import { authService } from '../../services/auth.service';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

const STEPS = ['Account', 'Profile', 'Interests'];

const INTEREST_OPTIONS = [
  '🎮 Gaming', '💻 Coding', '🎨 Design', '📚 Study',
  '🏆 Sports', '🎵 Music', '🚀 Startups', '🤖 AI/ML',
  '📱 Mobile Dev', '🌐 Web Dev', '🔒 Cybersecurity', '☁️ Cloud',
];

export default function RegisterScreen({ navigation }: Props) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Step 0 — Account
  const [name, setName]         = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail]       = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [phone, setPhone]       = useState('');
  const [password, setPassword] = useState('');

  // Step 1 — Profile
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [location, setLocation] = useState('');
  const [college, setCollege] = useState('');

  // Step 2 — Interests
  const [interests, setInterests] = useState<string[]>([]);

  const toggleInterest = (i: string) =>
    setInterests(v => v.includes(i) ? v.filter(x => x !== i) : [...v, i]);

  const nextStep = () => {
    if (step < 2) { setStep(s => s + 1); return; }
    handleSubmit();
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const signupData = {
        name: name.trim(),
        username: username.trim(),
        email: email.trim().toLowerCase(),
        countryCode: countryCode.trim().startsWith('+') ? countryCode.trim() : '+' + countryCode.trim(),
        phone: phone.replace(/\D/g, ''), // Remove all non-digit characters (spaces, dashes, etc.)
        password,
        dateOfBirth: dateOfBirth.trim(),
        location: location.trim(),
        college: college.trim(),
        interests
      };

      const res = await authService.sendOtp({ 
        email: signupData.email, 
        countryCode: signupData.countryCode, 
        phone: signupData.phone 
      });
      const verificationToken = res.data?.verificationToken || res.verificationToken;
      
      // @ts-ignore
      navigation.navigate('OTP', { signupData, verificationToken });
    } catch (e: any) {
      console.log('OTP Error response:', JSON.stringify(e.response?.data, null, 2));
      const errors = e.response?.data?.errors;
      const errMsg = errors ? JSON.stringify(errors) : (e.response?.data?.message || e.message);
      alert(errMsg || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#070714', '#0E0E24']} style={styles.container}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Back */}
          <TouchableOpacity onPress={() => step > 0 ? setStep(s => s - 1) : navigation.goBack()} style={styles.back}>
            <Ionicons name="arrow-back" size={22} color={colors.text.secondary} />
          </TouchableOpacity>

          {/* Progress steps */}
          <View style={styles.stepsRow}>
            {STEPS.map((s, i) => (
              <View key={i} style={styles.stepItem}>
                <View style={[styles.stepCircle, i <= step && styles.stepCircleActive]}>
                  {i < step
                    ? <Ionicons name="checkmark" size={14} color="#fff" />
                    : <Text style={styles.stepNum}>{i + 1}</Text>
                  }
                </View>
                <Text style={[styles.stepLabel, i <= step && styles.stepLabelActive]}>{s}</Text>
                {i < STEPS.length - 1 && (
                  <View style={[styles.stepLine, i < step && styles.stepLineActive]} />
                )}
              </View>
            ))}
          </View>

          {/* Step 0: Account */}
          {step === 0 && (
            <View>
              <Text style={styles.stepTitle}>Create your account 🚀</Text>
              <Text style={styles.stepSub}>Let's get you started in 3 quick steps</Text>
              <View style={styles.form}>
                <Input label="Full Name"    icon="person-outline"  value={name}     onChangeText={setName}     placeholder="Arjun Kumar" />
                <Input label="Username"     icon="at-outline"      value={username} onChangeText={setUsername} placeholder="arjunkumar_1" autoCapitalize="none" />
                <Input label="Email"        icon="mail-outline"    value={email}    onChangeText={setEmail}    placeholder="arjun@iitd.ac.in" keyboardType="email-address" autoCapitalize="none" />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 0.35 }}>
                    <Input label="Code" icon="globe-outline" value={countryCode} onChangeText={setCountryCode} placeholder="+91" keyboardType="phone-pad" />
                  </View>
                  <View style={{ flex: 0.65 }}>
                    <Input label="Phone Number" icon="call-outline" value={phone} onChangeText={setPhone} placeholder="98765 43210" keyboardType="phone-pad" />
                  </View>
                </View>
                <Input label="Password"     icon="lock-closed-outline" value={password} onChangeText={setPassword} placeholder="Min. 8 characters" secureTextEntry />
              </View>
            </View>
          )}

          {/* Step 1: Profile */}
          {step === 1 && (
            <View>
              <Text style={styles.stepTitle}>Tell us about you 👤</Text>
              <Text style={styles.stepSub}>Help your community know you better</Text>
              <View style={styles.form}>
                <Input label="Date of Birth"      icon="calendar-outline" value={dateOfBirth}     onChangeText={setDateOfBirth}     placeholder="YYYY-MM-DD" />
                <Input label="City / Location"    icon="location-outline" value={location}    onChangeText={setLocation}    placeholder="Bangalore" />
                <Input label="College/University" icon="school-outline"   value={college} onChangeText={setCollege} placeholder="IIT Delhi" />
              </View>
            </View>
          )}

          {/* Step 2: Interests */}
          {step === 2 && (
            <View>
              <Text style={styles.stepTitle}>What are you into? 🎯</Text>
              <Text style={styles.stepSub}>Pick at least 3 interests to personalize your feed</Text>
              <View style={styles.interestsGrid}>
                {INTEREST_OPTIONS.map(opt => {
                  const selected = interests.includes(opt);
                  return (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.interestChip, selected && styles.interestChipSelected]}
                      onPress={() => toggleInterest(opt)}
                    >
                      <Text style={[styles.interestText, selected && styles.interestTextSelected]}>
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.selectedCount}>
                {interests.length} selected{interests.length < 3 ? ` (${3 - interests.length} more to go)` : ' ✓'}
              </Text>
            </View>
          )}

          {/* CTA */}
          <Button
            label={step < 2 ? 'Continue →' : 'Create Account 🚀'}
            onPress={nextStep}
            variant="primary"
            fullWidth
            loading={loading}
            style={{ marginTop: 28 }}
          />

          <View style={styles.loginRow}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>Log in →</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 60 },
  back: {
    width: 40, height: 40, borderRadius: radii.md,
    backgroundColor: colors.bg.card,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
  },
  stepsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 32, gap: 0 },
  stepItem: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  stepCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepCircleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stepNum: { fontSize: fontSizes.xs, color: colors.text.muted, fontWeight: '700' },
  stepLabel: { fontSize: fontSizes.xs, color: colors.text.muted, marginLeft: 6, fontWeight: '600' },
  stepLabelActive: { color: colors.primaryLight },
  stepLine: { flex: 1, height: 1, backgroundColor: colors.border, marginHorizontal: 6 },
  stepLineActive: { backgroundColor: colors.primary },
  stepTitle: { fontSize: fontSizes.xxl, fontWeight: '800', color: colors.text.primary, marginBottom: 6 },
  stepSub: { fontSize: fontSizes.sm, color: colors.text.muted, marginBottom: 24 },
  form: { gap: 2 },
  interestsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  interestChip: {
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: radii.full,
    borderWidth: 1, borderColor: colors.borderHover,
    backgroundColor: colors.bg.card,
  },
  interestChipSelected: {
    backgroundColor: 'rgba(124,58,237,0.2)',
    borderColor: colors.primary,
  },
  interestText: { fontSize: fontSizes.sm, color: colors.text.secondary, fontWeight: '500' },
  interestTextSelected: { color: colors.primaryLight, fontWeight: '700' },
  selectedCount: { fontSize: fontSizes.xs, color: colors.text.muted, marginTop: 12 },
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  loginText: { fontSize: fontSizes.sm, color: colors.text.muted },
  loginLink: { fontSize: fontSizes.sm, color: colors.primaryLight, fontWeight: '700' },
});
