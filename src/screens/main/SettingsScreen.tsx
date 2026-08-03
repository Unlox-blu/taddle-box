import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  Linking,
  Platform,
  ActionSheetIOS,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { fontSizes, spacing, radii, type ColorPalette } from "../../theme";
import { useWallet } from "../../context/WalletContext";
import { useTheme, useThemeColors } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { authService } from "../../services/auth.service";
import { appConfigService } from "../../services/appConfig.service";
import { settingsService } from "../../services/settings.service";
import { useGameSoundPrefs } from "../../services/gameSound";
import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";
import { useFocusEffect } from "@react-navigation/native";
import type { HomeStackParamList } from "../../types";

type NavProp = NativeStackNavigationProp<HomeStackParamList, "Settings">;

const maskEmail = (email?: string) => {
  if (!email) return "Not linked";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  if (local.length <= 2) {
    return `${local.substring(0, 1)}*@${domain}`;
  }
  return `${local.substring(0, 2)}***${local.substring(local.length - 1)}@${domain}`;
};

const maskPhone = (phone?: string, countryCode?: string) => {
  if (!phone) return "Not linked";
  const full = countryCode ? `${countryCode}${phone}` : phone;
  if (full.length <= 4) return full;
  const start = full.substring(0, 3);
  const end = full.substring(full.length - 2);
  const stars = '*'.repeat(Math.max(1, full.length - 5));
  return `${start}${stars}${end}`;
};

  export default function SettingsScreen() {
  const { user: CURRENT_USER, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const { wallet, toggleSetting, fetchWalletData } = useWallet();
  const { isDark, colors, themePreference, setThemePreference } = useTheme();
  const {
    soundEnabled,
    hapticsEnabled,
    setSoundEnabled,
    setHapticsEnabled,
  } = useGameSoundPrefs();
  const { storeUrl } = useAuth();

  const [checkingVersion, setCheckingVersion] = useState(false);

  const [publicAccount, setPublicAccount] = useState(true);
  const [activityStatus, setActivityStatus] = useState(true);
  const [allowTagging, setAllowTagging] = useState(true);
  const [showOnLeaderboard, setShowOnLeaderboard] = useState(true);
  const [appBiometric, setAppBiometric] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchWalletData();
      SecureStore.getItemAsync("app_biometricEnabled").then((val) => {
        setAppBiometric(val === "true");
      });
      // Fetch user settings (privacy toggles)
      settingsService
        .getSettings()
        .then((res) => {
          if (res?.data) {
            setPublicAccount(res.data.publicAccount ?? true);
            setActivityStatus(res.data.activityStatus ?? true);
            setAllowTagging(res.data.allowTagging ?? true);
            setShowOnLeaderboard(res.data.showOnLeaderboard ?? true);
          }
        })
        .catch(console.error);
    }, []),
  );

  const toggleBiometric = async () => {
    // Biometric can only be enabled if PIN (App Lock) is set first
    if (!CURRENT_USER?.appLockEnabled) {
      Alert.alert(
        "PIN Required",
        "Please enable Global App Lock (PIN) before turning on biometric authentication.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Set Up PIN",
            onPress: () =>
              navigation.navigate("LockScreen", {
                mode: "app",
                isSetup: true,
                returnScreen: "Settings",
              }),
          },
        ],
      );
      return;
    }

    try {
      const newValue = !appBiometric;
      if (newValue) {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (!hasHardware || !isEnrolled) {
          Alert.alert(
            "Not Supported",
            "Biometrics are not supported or not enrolled on this device.",
          );
          return;
        }
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Authenticate to enable biometric app lock",
          cancelLabel: "Cancel",
        });
        if (result.success) {
          await SecureStore.setItemAsync("app_biometricEnabled", "true");
          setAppBiometric(true);
        }
      } else {
        await SecureStore.setItemAsync("app_biometricEnabled", "false");
        setAppBiometric(false);
      }
    } catch (e) {
      console.log("Biometric error", e);
    }
  };

  const handleThemePicker = () => {
    const options = [
      { label: "📱 System Default", value: "system" as const },
      { label: "🌙 Dark", value: "dark" as const },
      { label: "☀️ Light", value: "light" as const },
    ];
    const current =
      options.find((o) => o.value === themePreference)?.label ??
      "System Default";
    Alert.alert("App Theme", `Currently: ${current}`, [
      ...options.map((o) => ({
        text: o.label,
        onPress: () => setThemePreference(o.value),
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: () => signOut(),
      },
    ]);
  };

  const handleDeleteAccount = () => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        "Delete Account",
        "This action is permanent and cannot be undone. Type 'DELETE' to confirm.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async (text?: string) => {
              if (text !== "DELETE") {
                Alert.alert("Error", "You must type DELETE to confirm.");
                return;
              }
              try {
                await authService.deleteAccount();
                await signOut();
              } catch (e: any) {
                Alert.alert("Error", e.message || "Failed to delete account");
              }
            },
          },
        ],
        "plain-text",
      );
    } else {
      Alert.alert(
        "Delete Account",
        "This action is permanent and cannot be undone. Are you absolutely sure you want to delete your account?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await authService.deleteAccount();
                await signOut();
              } catch (e: any) {
                Alert.alert("Error", e.message || "Failed to delete account");
              }
            },
          },
        ]
      );
    }
  };

  const handleLanguagePicker = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "English (Default)"],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          // Only English available for now
        },
      );
    } else {
      Alert.alert("Language", "Select your preferred language", [
        { text: "Cancel", style: "cancel" },
        { text: "English (Default)", onPress: () => {} },
      ]);
    }
  };

  const handleAppVersionCheck = async () => {
    try {
      setCheckingVersion(true);
      const res = await appConfigService.getAppConfig();
      const config = res.data;
      const currentVersion = "1.0.0"; // Hardcoded for now

      if (config.latestVersion && config.latestVersion > currentVersion) {
        Alert.alert(
          "Update Available",
          `Version ${config.latestVersion} is available. Would you like to update now?`,
          [
            { text: "Later", style: "cancel" },
            {
              text: "Update",
              onPress: () =>
                Linking.openURL(
                  config.storeUrl || "https://play.google.com/store",
                ),
            },
          ],
        );
      } else {
        Alert.alert(
          "Up to Date ✅",
          "You are running the latest version of Taddle.",
        );
      }
    } catch (err) {
      Alert.alert(
        "Error",
        "Failed to check for updates. Please try again later.",
      );
    } finally {
      setCheckingVersion(false);
    }
  };

  const handleRateApp = () => {
    Linking.openURL(storeUrl || "https://play.google.com/store");
    setTimeout(() => {
      Alert.alert("Thank you! ⭐", "Your support means a lot to us.");
    }, 1000);
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, backgroundColor: colors.bg.base },
      ]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[
            styles.backBtn,
            { backgroundColor: colors.bg.card, borderColor: colors.border },
          ]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
          Settings
        </Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        {/* Account info strip */}
        <View
          style={[
            styles.accountStrip,
            { backgroundColor: colors.bg.card, borderColor: colors.border },
          ]}
        >
          <View style={[styles.accountAvatar, { overflow: 'hidden' }]}>
            {CURRENT_USER?.avatarUrl ? (
              <Image source={{ uri: CURRENT_USER.avatarUrl }} style={{ width: '100%', height: '100%' }} />
            ) : (
              <Text style={{ fontSize: 28 }}>👾</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.accountName, { color: colors.text.primary }]}>
              {CURRENT_USER?.name || "Taddle User"}
            </Text>
            <Text
              style={[styles.accountHandle, { color: colors.primaryLight }]}
            >
              {CURRENT_USER?.username || "user"}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.editBtn, { borderColor: "rgba(124,58,237,0.35)" }]}
            onPress={() => navigation.navigate("EditProfile")}
          >
            <Text style={[styles.editBtnText, { color: colors.primaryLight }]}>
              Edit Profile
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Account & Security ── */}
        <SectionHeader title="Account & Security" />
        <SettingsGroup>
          <SettingsToggle
            icon="shield-checkmark-outline"
            label="Global App Lock"
            description="Require PIN to open app"
            value={CURRENT_USER?.appLockEnabled || false}
            onToggle={() => {
              if (CURRENT_USER?.appLockEnabled) {
                navigation.navigate("LockScreen", {
                  mode: "app",
                  isSetup: false,
                  isDisable: true,
                  returnScreen: "Settings",
                });
              } else if (CURRENT_USER?.appLock) {
                navigation.navigate("LockScreen", {
                  mode: "app",
                  isSetup: false,
                  returnScreen: "Settings",
                });
              } else {
                navigation.navigate("LockScreen", {
                  mode: "app",
                  isSetup: true,
                  returnScreen: "Settings",
                });
              }
            }}
          />
          <SettingsToggle
            icon="finger-print-outline"
            label="Biometric App Lock"
            description={
              CURRENT_USER?.appLockEnabled
                ? "Use Face ID / Touch ID for App Lock"
                : "Requires App Lock PIN to be set first"
            }
            value={appBiometric && !!CURRENT_USER?.appLockEnabled}
            onToggle={toggleBiometric}
          />
          <SettingsRow
            icon="key-outline"
            label="Change Password"
            onPress={() => navigation.navigate("ChangePassword")}
          />
          <SettingsRow
            icon="call-outline"
            label="Phone"
            value={(CURRENT_USER?.phone || CURRENT_USER?.phoneNumber) ? maskPhone((CURRENT_USER?.phone || CURRENT_USER?.phoneNumber), CURRENT_USER.countryCode) : "Not linked"}
            onPress={() => navigation.navigate("ChangePhone")}
          />
          <SettingsRow
            icon="mail-outline"
            label="Email"
            value={CURRENT_USER?.email ? maskEmail(CURRENT_USER.email) : "Not linked"}
            onPress={() => navigation.navigate("ChangeEmail")}
            last
          />
        </SettingsGroup>

        {/* ── Notifications ── */}
        <SectionHeader title="Notifications" />
        <SettingsGroup>
          <SettingsToggle
            icon="flash-outline"
            label="XP Rewards"
            description="Notify when you earn XP"
            value={wallet.notifXP}
            onToggle={() => toggleSetting("notifXP")}
          />
          <SettingsToggle
            icon="cash-outline"
            label="Withdrawals"
            description="Transaction status updates"
            value={wallet.notifWithdraw}
            onToggle={() => toggleSetting("notifWithdraw")}
          />
          <SettingsToggle
            icon="megaphone-outline"
            label="Promotions & Events"
            description="Hackathons, webinars and more"
            value={wallet.notifPromos}
            onToggle={() => toggleSetting("notifPromos")}
            last
          />
        </SettingsGroup>

        {/* ── Privacy ── */}
        <SectionHeader title="Privacy" />
        <SettingsGroup>
          <SettingsToggle
            icon="earth-outline"
            label="Public Account"
            description="Anyone can see your posts"
            value={publicAccount}
            onToggle={async () => {
              const old = publicAccount;
              setPublicAccount(!old);
              try {
                await settingsService.togglePublicAccount();
              } catch (e) {
                setPublicAccount(old);
              }
            }}
          />
          <SettingsToggle
            icon="radio-button-on-outline"
            label="Activity Status"
            description="Show when you're online"
            value={activityStatus}
            onToggle={async () => {
              const old = activityStatus;
              setActivityStatus(!old);
              try {
                await settingsService.toggleActivityStatus();
              } catch (e) {
                setActivityStatus(old);
              }
            }}
          />
          <SettingsToggle
            icon="at-outline"
            label="Allow Tagging"
            description="Let others tag you in posts"
            value={allowTagging}
            onToggle={async () => {
              const old = allowTagging;
              setAllowTagging(!old);
              try {
                await settingsService.toggleAllowTagging();
              } catch (e) {
                setAllowTagging(old);
              }
            }}
          />
          <SettingsToggle
            icon="trophy-outline"
            label="Show on Leaderboard"
            description="Appear in public rankings"
            value={showOnLeaderboard}
            onToggle={async () => {
              const old = showOnLeaderboard;
              setShowOnLeaderboard(!old);
              try {
                await settingsService.toggleShowOnLeaderboard();
              } catch (e) {
                setShowOnLeaderboard(old);
              }
            }}
            last
          />
        </SettingsGroup>

        {/* ── App Preferences ── */}
        <SectionHeader title="App Preferences" />
        <SettingsGroup>
          <SettingsToggle
            icon="volume-high-outline"
            label="Sound Effects"
            description="Countdown beeps and game sounds"
            value={soundEnabled}
            onToggle={() => setSoundEnabled(!soundEnabled)}
          />
          <SettingsToggle
            icon="pulse-outline"
            label="Haptic Feedback"
            description="Vibrate on taps, turns and results"
            value={hapticsEnabled}
            onToggle={() => setHapticsEnabled(!hapticsEnabled)}
          />
          <SettingsRow
            icon="color-palette-outline"
            label="App Theme"
            value={
              themePreference === "system"
                ? "📱 System"
                : themePreference === "dark"
                  ? "🌙 Dark"
                  : "☀️ Light"
            }
            onPress={handleThemePicker}
          />
          <SettingsRow
            icon="language-outline"
            label="Language"
            value="English"
            onPress={handleLanguagePicker}
            last
          />
        </SettingsGroup>

        {/* ── About ── */}
        <SectionHeader title="About" />
        <SettingsGroup>
          <SettingsRow
            icon="document-text-outline"
            label="Terms of Service"
            onPress={() => navigation.navigate("Terms")}
          />
          <SettingsRow
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            onPress={() => navigation.navigate("Privacy")}
          />
          <SettingsRow
            icon="star-outline"
            label="Rate the App"
            onPress={handleRateApp}
          />
          <SettingsRow
            icon="information-circle-outline"
            label="App Version"
            value={checkingVersion ? "Checking..." : "1.0.0"}
            onPress={handleAppVersionCheck}
            last
          />
        </SettingsGroup>

        {/* ── Danger zone ── */}
        <SectionHeader title="Account Actions" />
        <SettingsGroup>
          <TouchableOpacity style={styles.dangerRow} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={colors.danger} />
            <Text style={[styles.dangerLabel, { color: colors.danger }]}>
              Log Out
            </Text>
          </TouchableOpacity>
          <View
            style={[styles.groupDivider, { backgroundColor: colors.border }]}
          />
          <TouchableOpacity
            style={styles.dangerRow}
            onPress={handleDeleteAccount}
          >
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
            <Text
              style={[
                styles.dangerLabel,
                { color: colors.danger, opacity: 0.7 },
              ]}
            >
              Delete Account
            </Text>
          </TouchableOpacity>
        </SettingsGroup>
      </ScrollView>
    </View>
  );
}

// ─── Sub-components (each reads theme independently) ─────────────────────────

function SectionHeader({ title }: { title: string }) {
  const colors = useThemeColors();
  return (
    <Text style={[shared.sectionHeader, { color: colors.text.muted }]}>
      {title}
    </Text>
  );
}

function SettingsGroup({ children }: { children: React.ReactNode }) {
  const colors = useThemeColors();
  return (
    <View
      style={[
        shared.group,
        { backgroundColor: colors.bg.card, borderColor: colors.border },
      ]}
    >
      {children}
    </View>
  );
}

type RowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  last?: boolean;
};

function SettingsRow({ icon, label, value, onPress, last }: RowProps) {
  const colors = useThemeColors();
  return (
    <>
      <TouchableOpacity
        style={shared.row}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={shared.rowIcon}>
          <Ionicons name={icon} size={19} color={colors.primaryLight} />
        </View>
        <Text style={[shared.rowLabel, { color: colors.text.primary }]}>
          {label}
        </Text>
        <View style={shared.rowRight}>
          {value !== undefined && (
            <Text style={[shared.rowValue, { color: colors.text.muted }]}>
              {value}
            </Text>
          )}
          <Ionicons
            name="chevron-forward"
            size={15}
            color={colors.text.muted}
          />
        </View>
      </TouchableOpacity>
      {!last && (
        <View style={[shared.rowDiv, { backgroundColor: colors.border }]} />
      )}
    </>
  );
}

type ToggleProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  value: boolean;
  onToggle: () => void;
  last?: boolean;
};

function SettingsToggle({
  icon,
  label,
  description,
  value,
  onToggle,
  last,
}: ToggleProps) {
  const colors = useThemeColors();
  return (
    <>
      <TouchableOpacity
        style={shared.row}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <View style={shared.rowIcon}>
          <Ionicons name={icon} size={19} color={colors.primaryLight} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[shared.rowLabel, { color: colors.text.primary }]}>
            {label}
          </Text>
          <Text style={[shared.rowDesc, { color: colors.text.muted }]}>
            {description}
          </Text>
        </View>
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{
            false: colors.bg.elevated,
            true: "rgba(124,58,237,0.55)",
          }}
          thumbColor={value ? colors.primaryLight : colors.text.muted}
        />
      </TouchableOpacity>
      {!last && (
        <View style={[shared.rowDiv, { backgroundColor: colors.border }]} />
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: fontSizes.xl,
    fontWeight: "800",
  },
  accountStrip: {
    flexDirection: "row",
    alignItems: "center",
    margin: spacing.lg,
    gap: 12,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
  },
  accountAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(124,58,237,0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  accountName: { fontSize: fontSizes.md, fontWeight: "800" },
  accountHandle: { fontSize: fontSizes.sm, marginTop: 2 },
  editBtn: {
    backgroundColor: "rgba(124,58,237,0.18)",
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  editBtnText: { fontSize: fontSizes.xs, fontWeight: "700" },
  dangerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    gap: 12,
  },
  dangerLabel: { fontSize: fontSizes.md, fontWeight: "600" },
  groupDivider: { height: 1, marginHorizontal: spacing.md },
});

const shared = StyleSheet.create({
  sectionHeader: {
    fontSize: fontSizes.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  group: {
    marginHorizontal: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    gap: 12,
  },
  rowDiv: { height: 1, marginHorizontal: spacing.md },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.sm,
    backgroundColor: "rgba(124,58,237,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { flex: 1, fontSize: fontSizes.md, fontWeight: "600" },
  rowDesc: { fontSize: fontSizes.xs, marginTop: 2 },
  rowValue: { fontSize: fontSizes.sm, marginRight: 6 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 4 },
});
