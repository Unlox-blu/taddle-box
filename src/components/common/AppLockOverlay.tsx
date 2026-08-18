import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  AppState,
  AppStateStatus,

  TouchableOpacity,
  Text,
  Modal,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { useThemeColors } from "../../context/ThemeContext";
import { fontSizes, spacing } from "../../theme";
import PinPad from "./PinPad";
import { authService } from "../../services/auth.service";
import { useAuth } from "../../context/AuthContext";
import { appLockBypass } from "../../utils/appLockBypass";
import { themedAlert } from './ThemedAlert';

export default function AppLockOverlay() {
  const colors = useThemeColors();
  const { user, isLoggedIn, signOut } = useAuth();

  const [isLocked, setIsLocked] = useState(false);
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [showBiometric, setShowBiometric] = useState(false);

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
      if (appLockBypass.shouldBypassLock()) return;

      // App came back to foreground — lock if app lock is enabled
      if (isLoggedIn && user?.appLockEnabled) {
        lockAndCheck();
      }
    }
  };

  // Lock on cold start / fresh app open.
  // The overlay only mounts after the auth check completes (isLoading → false),
  // so isLoggedIn and user are already resolved here.
  useEffect(() => {
    if (isLoggedIn && user?.appLockEnabled) {
      // Longer delay than background→foreground to let the app fully mount
      const timer = setTimeout(() => lockAndCheck(500), 100);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lock on background→foreground transitions
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
    return () => subscription.remove();
    // Re-register when auth state changes
  }, [isLoggedIn, user?.appLockEnabled]);

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
      console.log("Biometric error", e);
      // If the prompt threw entirely, retry once
      if (retryCount < 1) {
        setTimeout(() => triggerBiometric(retryCount + 1), 600);
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handlePinComplete = async (pin: string) => {
    try {
      setIsVerifying(true);
      setError("");
      await authService.verifyPin(pin);
      setIsLocked(false);
      isLockedRef.current = false;
    } catch (e: any) {
      setError(e.response?.data?.message || "Invalid PIN");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleLogout = () => {
    themedAlert(
      "Log Out",
      "Are you sure you want to log out? This will bring you back to the login screen.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log Out",
          style: "destructive",
          onPress: () => {
            setIsLocked(false);
            isLockedRef.current = false;
            signOut();
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={isLocked}
      animationType="fade"
      statusBarTranslucent
      transparent={false}
    >
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.bg.base }]}
      >
        <PinPad
          title="Enter App Lock PIN"
          subtitle="Please enter your 4-digit PIN to continue"
          length={4}
          onPinComplete={handlePinComplete}
          onBiometric={triggerBiometric}
          showBiometric={showBiometric}
          error={error}
          isVerifying={isVerifying}
        />
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={[styles.logoutText, { color: colors.danger }]}>
            Log out
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
