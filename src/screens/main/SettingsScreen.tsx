import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Switch, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
import { useWallet } from '../../context/WalletContext';
import { useTheme, useThemeColors } from '../../context/ThemeContext';
import { CURRENT_USER } from '../../types/mockData';
import type { HomeStackParamList } from '../../types';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'Settings'>;

export default function SettingsScreen() {
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const { wallet, toggleSetting } = useWallet();
  const { isDark, colors, toggleTheme } = useTheme();

  const [publicAccount,     setPublicAccount]     = useState(true);
  const [activityStatus,    setActivityStatus]    = useState(true);
  const [allowTagging,      setAllowTagging]      = useState(true);
  const [showOnLeaderboard, setShowOnLeaderboard] = useState(true);

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Out', style: 'destructive', onPress: () => Alert.alert('Logged out', 'You have been logged out.') },
      ],
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action is permanent and cannot be undone. All your data, posts, and XP will be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {} },
      ],
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.bg.base }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: colors.bg.card, borderColor: colors.border }]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Settings</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>

        {/* Account info strip */}
        <View style={[styles.accountStrip, { backgroundColor: colors.bg.card, borderColor: colors.border }]}>
          <View style={styles.accountAvatar}>
            <Text style={{ fontSize: 28 }}>{CURRENT_USER.avatar}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.accountName,   { color: colors.text.primary  }]}>{CURRENT_USER.name}</Text>
            <Text style={[styles.accountHandle, { color: colors.primaryLight  }]}>{CURRENT_USER.handle}</Text>
          </View>
          <TouchableOpacity style={[styles.editBtn, { borderColor: 'rgba(124,58,237,0.35)' }]}>
            <Text style={[styles.editBtnText, { color: colors.primaryLight }]}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* ── Account & Security ── */}
        <SectionHeader title="Account & Security" />
        <SettingsGroup>
          <SettingsToggle icon="lock-closed-outline"   label="PIN Lock"          description="Require PIN to open wallet"    value={wallet.pinEnabled}      onToggle={() => toggleSetting('pinEnabled')}      />
          <SettingsToggle icon="finger-print-outline"  label="Biometric Login"   description="Use fingerprint or Face ID"    value={wallet.biometricEnabled} onToggle={() => toggleSetting('biometricEnabled')} />
          <SettingsRow    icon="key-outline"            label="Change Password"   onPress={() => Alert.alert('Coming Soon', 'Password change coming in next update.')} />
          <SettingsRow    icon="phone-portrait-outline" label="Linked Phone"      value="+91 98765 43210" onPress={() => {}} last />
        </SettingsGroup>

        {/* ── Notifications ── */}
        <SectionHeader title="Notifications" />
        <SettingsGroup>
          <SettingsToggle icon="flash-outline"     label="XP Rewards"          description="Notify when you earn XP"        value={wallet.notifXP}      onToggle={() => toggleSetting('notifXP')}      />
          <SettingsToggle icon="cash-outline"      label="Withdrawals"         description="Transaction status updates"     value={wallet.notifWithdraw} onToggle={() => toggleSetting('notifWithdraw')} />
          <SettingsToggle icon="megaphone-outline" label="Promotions & Events" description="Hackathons, webinars and more"  value={wallet.notifPromos}  onToggle={() => toggleSetting('notifPromos')}  last />
        </SettingsGroup>

        {/* ── Privacy ── */}
        <SectionHeader title="Privacy" />
        <SettingsGroup>
          <SettingsToggle icon="earth-outline"              label="Public Account"       description="Anyone can see your posts"      value={publicAccount}     onToggle={() => setPublicAccount(v => !v)}     />
          <SettingsToggle icon="radio-button-on-outline"    label="Activity Status"      description="Show when you're online"        value={activityStatus}    onToggle={() => setActivityStatus(v => !v)}    />
          <SettingsToggle icon="at-outline"                 label="Allow Tagging"        description="Let others tag you in posts"    value={allowTagging}      onToggle={() => setAllowTagging(v => !v)}      />
          <SettingsToggle icon="trophy-outline"             label="Show on Leaderboard"  description="Appear in public rankings"      value={showOnLeaderboard} onToggle={() => setShowOnLeaderboard(v => !v)} last />
        </SettingsGroup>

        {/* ── App Preferences ── */}
        <SectionHeader title="App Preferences" />
        <SettingsGroup>
          <SettingsRow icon="language-outline" label="Language" value="English" onPress={() => Alert.alert('Coming Soon', 'More languages coming soon!')} />
          <SettingsToggle
            icon="color-palette-outline"
            label="Dark Mode"
            description={isDark ? 'Currently using dark theme' : 'Currently using light theme'}
            value={isDark}
            onToggle={toggleTheme}
            last
          />
        </SettingsGroup>

        {/* ── About ── */}
        <SectionHeader title="About" />
        <SettingsGroup>
          <SettingsRow icon="document-text-outline"      label="Terms of Service" onPress={() => {}} />
          <SettingsRow icon="shield-checkmark-outline"   label="Privacy Policy"   onPress={() => {}} />
          <SettingsRow icon="star-outline"               label="Rate the App"     onPress={() => Alert.alert('Thank you! ⭐', 'Redirecting to app store...')} />
          <SettingsRow icon="information-circle-outline" label="App Version"      value="1.0.0" onPress={() => {}} last />
        </SettingsGroup>

        {/* ── Danger zone ── */}
        <SectionHeader title="Account Actions" />
        <SettingsGroup>
          <TouchableOpacity style={styles.dangerRow} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={colors.danger} />
            <Text style={[styles.dangerLabel, { color: colors.danger }]}>Log Out</Text>
          </TouchableOpacity>
          <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity style={styles.dangerRow} onPress={handleDeleteAccount}>
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
            <Text style={[styles.dangerLabel, { color: colors.danger, opacity: 0.7 }]}>Delete Account</Text>
          </TouchableOpacity>
        </SettingsGroup>

      </ScrollView>
    </View>
  );
}

// ─── Sub-components (each reads theme independently) ─────────────────────────

function SectionHeader({ title }: { title: string }) {
  const colors = useThemeColors();
  return <Text style={[shared.sectionHeader, { color: colors.text.muted }]}>{title}</Text>;
}

function SettingsGroup({ children }: { children: React.ReactNode }) {
  const colors = useThemeColors();
  return (
    <View style={[shared.group, { backgroundColor: colors.bg.card, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

type RowProps = {
  icon:    keyof typeof Ionicons.glyphMap;
  label:   string;
  value?:  string;
  onPress: () => void;
  last?:   boolean;
};

function SettingsRow({ icon, label, value, onPress, last }: RowProps) {
  const colors = useThemeColors();
  return (
    <>
      <TouchableOpacity style={shared.row} onPress={onPress} activeOpacity={0.7}>
        <View style={shared.rowIcon}>
          <Ionicons name={icon} size={19} color={colors.primaryLight} />
        </View>
        <Text style={[shared.rowLabel, { color: colors.text.primary }]}>{label}</Text>
        <View style={shared.rowRight}>
          {value !== undefined && <Text style={[shared.rowValue, { color: colors.text.muted }]}>{value}</Text>}
          <Ionicons name="chevron-forward" size={15} color={colors.text.muted} />
        </View>
      </TouchableOpacity>
      {!last && <View style={[shared.rowDiv, { backgroundColor: colors.border }]} />}
    </>
  );
}

type ToggleProps = {
  icon:        keyof typeof Ionicons.glyphMap;
  label:       string;
  description: string;
  value:       boolean;
  onToggle:    () => void;
  last?:       boolean;
};

function SettingsToggle({ icon, label, description, value, onToggle, last }: ToggleProps) {
  const colors = useThemeColors();
  return (
    <>
      <View style={shared.row}>
        <View style={shared.rowIcon}>
          <Ionicons name={icon} size={19} color={colors.primaryLight} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[shared.rowLabel, { color: colors.text.primary }]}>{label}</Text>
          <Text style={[shared.rowDesc,  { color: colors.text.muted   }]}>{description}</Text>
        </View>
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: colors.bg.elevated, true: 'rgba(124,58,237,0.55)' }}
          thumbColor={value ? colors.primaryLight : colors.text.muted}
        />
      </View>
      {!last && <View style={[shared.rowDiv, { backgroundColor: colors.border }]} />}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: radii.md,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  headerTitle: {
    flex: 1, textAlign: 'center',
    fontSize: fontSizes.xl, fontWeight: '800',
  },
  accountStrip: {
    flexDirection: 'row', alignItems: 'center',
    margin: spacing.lg, gap: 12,
    borderRadius: radii.lg, padding: spacing.md,
    borderWidth: 1,
  },
  accountAvatar: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: 'rgba(124,58,237,0.18)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
  },
  accountName:   { fontSize: fontSizes.md, fontWeight: '800' },
  accountHandle: { fontSize: fontSizes.sm, marginTop: 2 },
  editBtn: {
    backgroundColor: 'rgba(124,58,237,0.18)',
    borderRadius: radii.full, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  editBtnText: { fontSize: fontSizes.xs, fontWeight: '700' },
  dangerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: 14, gap: 12,
  },
  dangerLabel:  { fontSize: fontSizes.md, fontWeight: '600' },
  groupDivider: { height: 1, marginHorizontal: spacing.md },
});

const shared = StyleSheet.create({
  sectionHeader: {
    fontSize: fontSizes.xs, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.6,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xl, marginBottom: spacing.sm,
  },
  group: {
    marginHorizontal: spacing.lg,
    borderRadius: radii.lg, borderWidth: 1, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: 13, gap: 12,
  },
  rowDiv:   { height: 1, marginHorizontal: spacing.md },
  rowIcon:  {
    width: 34, height: 34, borderRadius: radii.sm,
    backgroundColor: 'rgba(124,58,237,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: { flex: 1, fontSize: fontSizes.md, fontWeight: '600' },
  rowDesc:  { fontSize: fontSizes.xs, marginTop: 2 },
  rowValue: { fontSize: fontSizes.sm, marginRight: 6 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
