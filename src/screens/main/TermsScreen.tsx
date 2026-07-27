import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useThemeColors } from '../../context/ThemeContext';
import { fontSizes, spacing, radii } from '../../theme';

const SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    body: `By accessing or using Taddle ("the App"), you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree to these terms, please do not use the App.`,
  },
  {
    title: '2. Use of the Service',
    body: `Taddle is a platform for developers and tech enthusiasts to connect, share knowledge, and earn rewards. You agree to use the App only for lawful purposes. You must not post content that is illegal, harmful, abusive, or infringes on any third party's rights.`,
  },
  {
    title: '3. Account Responsibility',
    body: `You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately of any unauthorized access to your account. Taddle is not liable for losses resulting from unauthorized use of your account.`,
  },
  {
    title: '4. Content & Intellectual Property',
    body: `You retain ownership of the content you post. By posting, you grant Taddle a non-exclusive, worldwide, royalty-free license to display and distribute your content within the App. You must not post content that violates any copyright or trademark laws.`,
  },
  {
    title: '5. XP & Rewards',
    body: `XP (Experience Points) and rewards are earned through eligible in-app activities. Taddle reserves the right to adjust XP values and reward structures at any time. Misuse of reward mechanisms may result in account suspension.`,
  },
  {
    title: '6. Wallet & Withdrawals',
    body: `Cash withdrawals require a linked UPI ID. Minimum withdrawal is ₹100. Taddle processes withdrawals in accordance with applicable laws. We may impose limits or suspend withdrawals if fraudulent activity is suspected.`,
  },
  {
    title: '7. Termination',
    body: `We reserve the right to suspend or terminate your account if you violate these Terms. Upon termination, your access to the App and its features will be revoked.`,
  },
  {
    title: '8. Changes to Terms',
    body: `We may update these Terms from time to time. We will notify you of significant changes via in-app notifications or email. Continued use of the App after changes constitutes acceptance.`,
  },
  {
    title: '9. Contact Us',
    body: `If you have questions about these Terms, please contact us at support@taddle.app`,
  },
];

export default function TermsScreen() {
  const navigation = useNavigation<any>();
  const colors     = useThemeColors();

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg.base }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.iconBtn, { borderColor: colors.border }]}>
          <Ionicons name="arrow-back" size={20} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Terms of Service</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={[styles.updated, { color: colors.text.muted }]}>Last updated: July 2026</Text>
        <Text style={[styles.intro, { color: colors.text.secondary }]}>
          Please read these Terms of Service carefully before using Taddle.
        </Text>

        {SECTIONS.map((s, i) => (
          <View key={i} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>{s.title}</Text>
            <Text style={[styles.sectionBody, { color: colors.text.secondary }]}>{s.body}</Text>
          </View>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  iconBtn:      { width: 38, height: 38, borderRadius: radii.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { flex: 1, fontSize: fontSizes.xl, fontWeight: '800' },
  body:         { padding: spacing.xl },
  updated:      { fontSize: fontSizes.xs, marginBottom: spacing.sm },
  intro:        { fontSize: fontSizes.md, lineHeight: 22, marginBottom: spacing.xl },
  section:      { marginBottom: spacing.xl },
  sectionTitle: { fontSize: fontSizes.md, fontWeight: '800', marginBottom: spacing.sm },
  sectionBody:  { fontSize: fontSizes.sm, lineHeight: 22 },
});
