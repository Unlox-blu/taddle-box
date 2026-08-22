import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  AppState,
  AppStateStatus,

  TouchableOpacity,
  Text,
  Modal,
  View,
  Alert,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { useThemeColors } from "../../context/ThemeContext";
import { fontSizes, spacing, radii } from "../../theme";
import PinPad from "./PinPad";
import RemovePinModal from "./RemovePinModal";
import { authService } from "../../services/auth.service";
import { useAuth } from "../../context/AuthContext";
import { nativeBypass } from "../../utils/nativeBypass";
import { themedAlert } from './ThemedAlert';
import * as ScreenCapture from 'expo-screen-capture';

export default function LockOverlay() {
  const colors = useThemeColors();
  const { user, isLoggedIn, signOut, goToAddAccount } = useAuth();
  const insets = useSafeAreaInsets();

  // ── Screenshot protection ──────────────────────────────────────────
  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync();
    return () => { ScreenCapture.allowScreenCaptureAsync(); };
  }, []);

  const [isLocked, setIsLocked] = useState(false);
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [showBiometric, setShowBiometric] = useState(false);
  const [removePinVisible, setRemovePinVisible] = useState(false);

  // ── PIN attempt lockout ─────────────────────────────────────────────────
  // After 3 wrong PINs, lock out for 30 seconds (client-side).
  // Server may also have its own rate limiting.
  const MAX_PIN_ATTEMPTS = 3;
  const PIN_LOCKOUT_MS = 30_000;
  const pinAttemptsRef = useRef(0);
  const pinLockoutUntilRef = useRef(0);
  const [pinLockoutRemaining, setPinLockoutRemaining] = useState(0);

  // Tick lockout timer every second
  useEffect(() => {
    if (pinLockoutUntilRef.current <= Date.now()) return;
    const t = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((pinLockoutUntilRef.current - Date.now()) / 1000));
      setPinLockoutRemaining(remaining);
      if (remaining <= 0) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [pinLockoutRemaining > 0]);

  // Use a ref so handleAppStateChange always sees fresh values without re-registering
  const appStateRef = useRef(AppState.currentState);
  const isLockedRef = useRef(false);

  // Sync ref whenever state changes
  useEffect(() => {
    isLockedRef.current = isLocked;
  }, [isLocked]);

  const lockAndCheck = async (delayMs = 300) => {
    if (isLockedRef.current) return; // already locked, don't double-trigger
    setIsLocked(true);
    isLockedRef.current = true;
    // Delay slightly so the overlay renders before biometric prompt
    setTimeout(() => checkBiometric(), delayMs);
  };

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    const prev = appStateRef.current;
    appStateRef.current = nextAppState;

    if (prev.match(/inactive|background/) && nextAppState === "active") {
      if (nativeBypass.shouldBypassLock()) return;

      // App came back to foreground — lock if global account lock is enabled
      if (isLoggedIn && (user?.globalAccountLockEnabled)) {
        lockAndCheck();
      }
    }
  };

  // Unified effect: lock whenever the user is logged in AND global account lock is enabled.
  // Covers: cold start, account switch, and re-login after logout.
  // The empty-effect fix: depend on the actual values so it re-fires when
  // user loads async (cold start) or switches (account switch).
  useEffect(() => {
    if (isLoggedIn && (user?.globalAccountLockEnabled)) {
      // Small delay lets the app finish mounting after login/switch
      const timer = setTimeout(() => lockAndCheck(500), 150);
      return () => clearTimeout(timer);
    }
    // If the lock was showing and the user somehow disabled it elsewhere,
      // dismiss the overlay.
    if (!user?.globalAccountLockEnabled && !user?.globalAccountLockEnabled && isLockedRef.current) {
      setIsLocked(false);
      isLockedRef.current = false;
    }
  }, [isLoggedIn, user?.globalAccountLockEnabled, user?.globalAccountLockEnabled]);

  // Lock on background→foreground transitions (re-registers when auth changes)
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
    return () => subscription.remove();
  }, [isLoggedIn, user?.globalAccountLockEnabled, user?.globalAccountLockEnabled]);

  const checkBiometric = async (retryCount = 0) => {
    const enabled = await SecureStore.getItemAsync("app_biometricEnabled");
    if (enabled !== "true") return;
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (hasHardware && isEnrolled) {
      setShowBiometric(true);
      triggerBiometric(retryCount);
    }
  };

  const triggerBiometric = async (retryCount = 0) => {
    try {
      setIsVerifying(true);
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock Taddle",
        disableDeviceFallback: true,
        cancelLabel: "Use PIN",
      });
      if (result.success) {
        setIsLocked(false);
        isLockedRef.current = false;
      }
      // On Android, the biometric prompt can silently fail on first attempt
      // (race with the activity resuming from background). Auto-retry once
      // after a short delay so the user doesn't have to tap the fingerprint
      // icon manually.
      else if (retryCount < 1 && result.error === "unknown") {
        setTimeout(() => triggerBiometric(retryCount + 1), 600);
      }
    } catch (e) {
      // Biometric error (silently handled)
      // If the prompt threw entirely, retry once
      if (retryCount < 1) {
        setTimeout(() => triggerBiometric(retryCount + 1), 600);
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handlePinComplete = async (pin: string) => {
    // Enforce client-side lockout after repeated wrong PINs
    if (pinLockoutUntilRef.current > Date.now()) {
      const secs = Math.ceil((pinLockoutUntilRef.current - Date.now()) / 1000);
      setError(`Too many attempts. Try again in ${secs}s`);
      return;
    }
    try {
      setIsVerifying(true);
      setError("");
      await authService.verifyPin(pin);
      // Success — reset attempt counter
      pinAttemptsRef.current = 0;
      pinLockoutUntilRef.current = 0;
      setPinLockoutRemaining(0);
      setIsLocked(false);
      isLockedRef.current = false;
    } catch (e: any) {
      const status = e?.response?.status;
      // 401 = expired/invalid JWT — session is dead, force re-login
      if (status === 401 && !e?.response?.data?.message?.includes('PIN')) {
        Alert.alert(
          "Session Expired",
          "Your session has expired. Please log in again.",
          [{ text: "OK", onPress: () => signOut() }]
        );
      } else {
        pinAttemptsRef.current += 1;
        if (pinAttemptsRef.current >= MAX_PIN_ATTEMPTS) {
          pinLockoutUntilRef.current = Date.now() + PIN_LOCKOUT_MS;
          setPinLockoutRemaining(Math.ceil(PIN_LOCKOUT_MS / 1000));
          setError(`Too many wrong PINs. Locked for 30 seconds.`);
        } else {
          const remaining = MAX_PIN_ATTEMPTS - pinAttemptsRef.current;
          setError(`${e.response?.data?.message || 'Invalid PIN'} — ${remaining} attempt${remaining > 1 ? 's' : ''} left`);
        }
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleLogout = () => {
    setIsLocked(false);
    isLockedRef.current = false;
    signOut({ keepAccount: true });
  };

  return (
    <Modal
      visible={isLocked}
      animationType="fade"
      statusBarTranslucent
      transparent={false}
    >
      <View
        style={[styles.container, { backgroundColor: colors.bg.base, paddingTop: insets.top }]}
      >
        {user && (
          <TouchableOpacity
            style={styles.profileRow}
            onPress={async () => {
              setIsLocked(false);
              isLockedRef.current = false;
              await goToAddAccount();
            }}
            activeOpacity={0.7}
          >
            <LinearGradient colors={["#4C1D95", "#7C3AED"]} style={styles.avatar}>
              {user?.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>👾</Text>
              )}
            </LinearGradient>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: colors.text.primary }]} numberOfLines={1}>
                {user?.name || "Taddle User"}
              </Text>
              <Text style={[styles.profileHandle, { color: colors.primaryLight }]} numberOfLines={1}>
                @{user?.username || "user"}
              </Text>
            </View>
            <View style={styles.switchIconWrap}>
              <Ionicons name="swap-horizontal" size={18} color={colors.primaryLight} />
            </View>
          </TouchableOpacity>
        )}

        <PinPad
          title="Enter Account PIN"
          subtitle="Please enter your 4-digit PIN to continue"
          length={4}
          onPinComplete={handlePinComplete}
          onBiometric={triggerBiometric}
          showBiometric={showBiometric}
          error={error}
          isVerifying={isVerifying}
        />

        <TouchableOpacity style={styles.forgotBtn} onPress={() => setRemovePinVisible(true)}>
          <Text style={[styles.forgotText, { color: colors.primaryLight }]}>Forgot PIN?</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={[styles.logoutText, { color: colors.danger }]}>Log out</Text>
        </TouchableOpacity>
      </View>

      <RemovePinModal
        visible={removePinVisible}
        onClose={() => setRemovePinVisible(false)}
        onSuccess={() => {
          setRemovePinVisible(false);
          setIsLocked(false);
          isLockedRef.current = false;
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  forgotBtn: {
    padding: spacing.sm,
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(124,58,237,0.05)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.15)",
    marginTop: spacing.xl,
    marginBottom: 0,
    gap: 12,
    maxWidth: '80%',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 20,
  },
  avatarText: {
    fontSize: 18,
  },
  profileInfo: {
    flex: 1,
    justifyContent: "center",
  },
  profileName: {
    fontSize: fontSizes.md,
    fontWeight: "700",
  },
  profileHandle: {
    fontSize: fontSizes.sm,
    fontWeight: "500",
  },
  switchIconWrap: {
    padding: 6,
    backgroundColor: "rgba(124,58,237,0.1)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.2)",
  },
  forgotText: {
    fontSize: fontSizes.sm,
    fontWeight: "600",
  },
  logoutBtn: {
    padding: spacing.md,
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  logoutText: {
    fontSize: fontSizes.md,
    fontWeight: "600",
  },
});
