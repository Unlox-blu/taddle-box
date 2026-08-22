import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,

  Linking,
  Image,
  Modal,
} from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { fontSizes, spacing, radii, type ColorPalette } from "../../theme";
import { useWallet } from "../../context/WalletContext";
import { useTheme, useThemeColors } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useGlobalScroll, useGlobalScrollHandler } from "../../context/ScrollContext";
import MainHeader from "../../components/common/MainHeader";
import SectionChrome, { useSectionChrome, SectionHeader } from "../../components/common/SectionChrome";
import { userService } from "../../services/user.service";
import { authService } from "../../services/auth.service";
import { appConfigService } from "../../services/appConfig.service";
import { settingsService } from "../../services/settings.service";
import { useGameSoundPrefs } from "../../services/gameSound";
import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";
import { useFocusEffect } from "@react-navigation/native";
import type { HomeStackParamList } from "../../types";
import { themedAlert, themedPrompt } from '../../components/common/ThemedAlert';
import PinPad from "../../components/common/PinPad";
import { nativeBypass } from "../../utils/nativeBypass";
import { log, error } from '../../utils/logger';

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
  const { user: CURRENT_USER, signOut, updateUser } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const { headerHeight } = useGlobalScroll();
  const handleGlobalScroll = useGlobalScrollHandler();
  const section = useSectionChrome(76);
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

  const [publicAccount, setPublicAccount] = useState(
    CURRENT_USER?.privacy !== "private"
  );
  const [activityStatus, setActivityStatus] = useState(true);
  const [allowTagging, setAllowTagging] = useState(true);
  const [allowReposts, setAllowReposts] = useState(true);
  const [showOnLeaderboard, setShowOnLeaderboard] = useState(true);
  const [appBiometric, setAppBiometric] = useState(false);
  const [safeSearch, setSafeSearch] = useState("moderate");

  const [verifyPinVisible, setVerifyPinVisible] = useState(false);
  const [verifyPinError, setVerifyPinError] = useState("");
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [pendingBiometricAction, setPendingBiometricAction] = useState<"enable" | "disable" | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchWalletData();
      SecureStore.getItemAsync("app_biometricEnabled").then((val) => {
        setAppBiometric(val === "true");
      });
      SecureStore.getItemAsync("app_safeSearch").then((val) => {
        if (val) setSafeSearch(val);
      });
      // Fetch user settings (privacy toggles)
      settingsService
        .getSettings()
        .then((res) => {
          if (res?.data) {
            setActivityStatus(res.data.activityStatus ?? true);
            setAllowTagging(res.data.allowTagging ?? true);
            setAllowReposts(res.data.allowReposts ?? true);
            setShowOnLeaderboard(res.data.showOnLeaderboard ?? true);
          }
        })
        .catch(error);
    }, []),
  );

  const toggleBiometric = async () => {
    // Biometric can only be enabled if PIN (Global Account Lock) is set first
    if (!CURRENT_USER?.globalAccountLockEnabled) {
      themedAlert(
        "PIN Required",
        "Please enable Global Account Lock (PIN) before turning on biometric authentication.",
        [
          { text: "Cancel", style: "cancel" },              { text: "Set Up PIN",
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
          themedAlert(
            "Not Supported",
            "Biometrics are not supported or not enrolled on this device.",
          );
          return;
        }
      }
      setPendingBiometricAction(newValue ? "enable" : "disable");
      setVerifyPinVisible(true);
    } catch (e) {
      log("Biometric error", e);
    }
  };

  const handleVerifyPinComplete = async (pin: string) => {
    try {
      setIsVerifyingPin(true);
      setVerifyPinError("");
      await authService.verifyPin(pin);
      
      if (pendingBiometricAction === "enable") {
        nativeBypass.beginNativeFlow();
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Authenticate to enable biometric global account lock",
          cancelLabel: "Cancel",
        });
        nativeBypass.endNativeFlow();
        
        if (result.success) {
          await SecureStore.setItemAsync("app_biometricEnabled", "true");
          setAppBiometric(true);
        }
      } else {
        await SecureStore.setItemAsync("app_biometricEnabled", "false");
        setAppBiometric(false);
      }
      setVerifyPinVisible(false);
      setPendingBiometricAction(null);
    } catch (e: any) {
      setVerifyPinError(e?.response?.data?.message || e?.message || "Invalid PIN");
    } finally {
      setIsVerifyingPin(false);
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
    themedAlert("App Theme", `Currently: ${current}`, [
      ...options.map((o) => ({
        text: o.label,
        onPress: () => setThemePreference(o.value),
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const handleSafeSearchPicker = () => {
    const options = [
      { label: "Strict", value: "strict" },
      { label: "Moderate", value: "moderate" },
      { label: "Auto", value: "auto" },
      { label: "Off", value: "off" },
    ];
    const current = options.find((o) => o.value === safeSearch)?.label ?? "Moderate";
    themedAlert("Content Preference", `Currently: ${current}\n\nControls whether potentially sensitive or explicit content is filtered from your searches and feeds.`, [
      ...options.map((o) => ({
        text: o.label,
        onPress: async () => {
          setSafeSearch(o.value);
          await SecureStore.setItemAsync("app_safeSearch", o.value);
        },
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  // Applies a privacy change. Going private → public auto-accepts all pending
  // follow requests server-side; the response reports how many were accepted.
  const applyPrivacyChange = async (next: boolean, old: boolean) => {
    setPublicAccount(next);
    try {
      const res = await userService.updatePrivacy(next ? "public" : "private");
      updateUser({ privacy: next ? "public" : "private" });
      const accepted = res?.data?.accepted;
      if (next && accepted) {
        themedAlert(
          "Requests accepted",
          `${accepted} pending follow request${accepted === 1 ? "" : "s"} ${accepted === 1 ? "was" : "were"} accepted automatically.`,
        );
      }
    } catch (e) {
      setPublicAccount(old);
      themedAlert(
        "Error",
        "Failed to update privacy settings. Please try again.",
      );
    }
  };

  const handleLogout = () => {
    themedAlert(
      "Log Out",
      "Choose how you want to log out:",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log Out from This Device",
          style: "default" as any,
          onPress: () => signOut(),
        },
        {
          text: "Log Out from All Devices",
          style: "destructive",
          onPress: () => signOut({ allDevices: true }),
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    // In-app themed prompt (works on both platforms) — the user must type
    // DELETE to confirm the permanent deletion.
    themedPrompt(
      "Delete Account",
      "This action is permanent and cannot be undone. Type 'DELETE' to confirm.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async (text?: string) => {
            if (text !== "DELETE") {
              themedAlert("Error", "You must type DELETE to confirm.");
              return;
            }
            try {
              await authService.deleteAccount();
              await signOut();
            } catch (e: any) {
              themedAlert("Error", e.message || "Failed to delete account");
            }
          },
        },
      ],
      "plain-text",
    );
  };

  const handleLanguagePicker = () => {
    // In-app themed picker (works on both platforms).
    themedAlert("Language", "Select your preferred language", [
      { text: "Cancel", style: "cancel" },
      { text: "English (Default)", onPress: () => {} },
    ]);
  };

  const handleAppVersionCheck = async () => {
    try {
      setCheckingVersion(true);
      const res = await appConfigService.getAppConfig();
      const config = res.data;
      const currentVersion = "1.0.0"; // Hardcoded for now

      if (config.latestVersion && config.latestVersion > currentVersion) {
        themedAlert(
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
        themedAlert(
          "Up to Date ✅",
          "You are running the latest version of Taddle.",
        );
      }
    } catch (err) {
      themedAlert(
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
      themedAlert("Thank you! ⭐", "Your support means a lot to us.");
    }, 1000);
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.bg.base },
      ]}
    >
      {/* Main header — logo, global search, notifications; back arrow instead
          of the drawer menu on this pushed screen. */}
      <MainHeader showBack />

      {/* Pinned section chrome — the page heading hides and shows IN LOCKSTEP
          with the main header (same treatment as the other screens'), instead
          of scrolling away with the list. */}
      <SectionChrome sectionY={section.sectionY} setSectionH={section.setSectionH}>
        <SectionHeader
          title="Settings"
          subtitle="Manage your account & preferences"
        />
      </SectionChrome>

      <ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={(e) => {
          handleGlobalScroll(e);
          section.handleScroll(e);
        }}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 60, paddingTop: headerHeight + section.sectionH }}
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
        <ContentSectionHeader title="Account & Security" />
        <SettingsGroup>
          <SettingsToggle
            icon="shield-checkmark-outline"
            label="Global Account Lock"
            description="Require PIN to access your account"
            value={CURRENT_USER?.globalAccountLockEnabled }
            onToggle={() => {
              if (CURRENT_USER?.globalAccountLockEnabled) {
                navigation.navigate("LockScreen", {
                  mode: "app",
                  isSetup: false,
                  isDisable: true,
                  returnScreen: "Settings",
                });
              } else if (CURRENT_USER?.lockPin || CURRENT_USER?.appLock) {
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
            label="Biometric Global Account Lock"
            description={
              CURRENT_USER?.globalAccountLockEnabled
                ? "Use Face ID / Touch ID for Global Account Lock"
                : "Requires Global Account Lock PIN to be set first"
            }
            value={appBiometric && !!CURRENT_USER?.globalAccountLockEnabled}
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
        <ContentSectionHeader title="Notifications" />
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
        <ContentSectionHeader title="Privacy" />
        <SettingsGroup>
          <SettingsToggle
            icon={publicAccount ? "earth-outline" : "lock-closed-outline"}
            label={publicAccount ? "Public Account" : "Private Account"}
            description={
              publicAccount
                ? "Anyone can follow you and see your posts"
                : "People must send a follow request you approve"
            }
            value={publicAccount}
            onToggle={() => {
              const old = publicAccount;
              const next = !old;
              // Going public auto-accepts every pending follow request — warn
              // the user before flipping the switch.
              if (next) {
                themedAlert(
                  "Make account public?",
                  "Switching to a public account will automatically accept all of your pending follow requests. You can't undo this by going private again.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Make Public",
                      onPress: () => applyPrivacyChange(next, old),
                    },
                  ],
                );
              } else {
                applyPrivacyChange(next, old);
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
            icon="repeat-outline"
            label="Allow Reposting"
            description="Let others repost your posts"
            value={allowReposts}
            onToggle={async () => {
              const old = allowReposts;
              setAllowReposts(!old);
              try {
                await settingsService.toggleAllowReposts();
              } catch (e) {
                setAllowReposts(old);
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
          />
          <SettingsRow
            icon="location-outline"
            label="Clear Location Data"
            description="Delete your captured location history"
            onPress={() => {
              themedAlert(
                "Clear Location Data",
                "This deletes your captured device location history. Your declared profile location is not affected.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Clear",
                    style: "destructive",
                    onPress: async () => {
                      try {
                        await userService.clearLocationData();
                        themedAlert(
                          "Cleared",
                          "Your captured location history has been deleted.",
                        );
                      } catch (e) {
                        themedAlert(
                          "Error",
                          "Failed to clear location data. Please try again.",
                        );
                      }
                    },
                  },
                ],
              );
            }}
            last
          />
        </SettingsGroup>

        {/* ── App Preferences ── */}
        <ContentSectionHeader title="App Preferences" />
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
            icon="shield-checkmark-outline"
            label="Content Preference"
            value={safeSearch.charAt(0).toUpperCase() + safeSearch.slice(1)}
            onPress={handleSafeSearchPicker}
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
        <ContentSectionHeader title="About" />
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
        <ContentSectionHeader title="Account Actions" />
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

      {verifyPinVisible && (
        <Modal visible={verifyPinVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setVerifyPinVisible(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.base }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <TouchableOpacity onPress={() => setVerifyPinVisible(false)}>
                <Ionicons name="arrow-back" size={24} color={colors.text.secondary} />
              </TouchableOpacity>
              <Text style={{ fontSize: fontSizes.lg, fontWeight: '700', color: colors.text.primary }}>Verify PIN</Text>
              <View style={{ width: 24 }} />
            </View>
            <PinPad
              title="Enter your PIN"
              subtitle="Verify your PIN to disable biometric unlock"
              length={4}
              onPinComplete={handleVerifyPinComplete}
              error={verifyPinError}
              isVerifying={isVerifyingPin}
            />
          </SafeAreaView>
        </Modal>
      )}
    </View>
  );
}

// ─── Sub-components (each reads theme independently) ─────────────────────────

const ContentSectionHeader = React.memo(function ContentSectionHeader({ title }: { title: string }) {
  const colors = useThemeColors();
  return (
    <Text style={[shared.sectionHeader, { color: colors.text.muted }]}>
      {title}
    </Text>
  );
})

const SettingsGroup = React.memo(function SettingsGroup({ children }: { children: React.ReactNode }) {
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
})

type RowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  description?: string;
  onPress: () => void;
  last?: boolean;
};

const SettingsRow = React.memo(function SettingsRow({ icon, label, value, description, onPress, last }: RowProps) {
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
        <View style={{ flex: 1 }}>
          <Text style={[shared.rowLabel, { color: colors.text.primary }]}>
            {label}
          </Text>
          {description ? (
            <Text style={[shared.rowDesc, { color: colors.text.muted }]}>
              {description}
            </Text>
          ) : null}
        </View>
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
})

type ToggleProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  value: boolean;
  onToggle: () => void;
  last?: boolean;
};

const SettingsToggle = React.memo(function SettingsToggle({
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
})

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
