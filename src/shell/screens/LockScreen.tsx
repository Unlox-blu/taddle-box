import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,

  TextInput,
  TouchableOpacity,
  Text,
} from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "../../infrastructure/storage/secure-store";
import { useThemeColors } from "../../design-system/theme/ThemeProvider";
import { spacing, fontSizes } from "../../design-system";
import PinPad from "../../design-system/components/PinPad";
import RemovePinModal from "../../features/posts/components/RemovePinModal";
import { authService } from "../../features/auth/api/auth.api";
import { useAuth } from "../../features/auth/state/AuthProvider";
import { useWallet } from "../../features/wallet/state/WalletProvider";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { takeScreenParams } from "../../shared/state/screen-params";
import { themedAlert } from '../../design-system/components/ThemedAlert';
import { log } from '../../infrastructure/logging/logger';

export default function LockScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  // mode: 'app' | 'wallet'
  // isSetup: if true, we are creating a new PIN
  // isDisable: if true, we are removing the PIN
  // isVerifyToEnable: if true, we are verifying before enabling
  // returnScreen: route to replace this screen with upon success
  // Staged lock params (booleans from Settings) — consumed exactly once on
  // mount so re-renders keep the same flow mode.
  const [staged] = useState(() => takeScreenParams<Record<string, unknown>>("lock"));
  const stagedParams = staged || {};
  const url = useLocalSearchParams<Record<string, string>>();
  const mode = String(stagedParams.mode ?? url.mode ?? "wallet");
  const boolParam = (key: string) =>
    key in stagedParams ? Boolean(stagedParams[key]) : url[key] === "true";
  const isSetup = boolParam("isSetup");
  const isDisable = boolParam("isDisable");
  const isVerifyToEnable = boolParam("isVerifyToEnable");
  const returnScreen = String(stagedParams.returnScreen ?? url.returnScreen ?? "");

  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [showBiometric, setShowBiometric] = useState(false);
  const [setupStep, setSetupStep] = useState<"enter" | "confirm">("enter");
  const [firstPin, setFirstPin] = useState("");
  const [removePinVisible, setRemovePinVisible] = useState(false);
  const { signOut, refreshUser } = useAuth();
  
  // Safe destructure since we may not be in WalletProvider in all test envs,
  // but we are in production (AppShell).
  const walletContext = useWallet();
  const fetchWalletData = walletContext?.fetchWalletData;

  useFocusEffect(
    useCallback(() => {
      checkBiometric();
    }, []),
  );

  const checkBiometric = async () => {
    const key =
      mode === "app" ? "app_biometricEnabled" : "wallet_biometricEnabled";
    const enabled = await SecureStore.getItemAsync(key);

    if (enabled === "true") {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (hasHardware && isEnrolled) {
        setShowBiometric(true);
        triggerBiometric();
      }
    }
  };

  const triggerBiometric = async () => {
    try {
      setIsVerifying(true);
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: mode === "app" ? "Unlock Taddle" : "Unlock Wallet",
        disableDeviceFallback: true,
        cancelLabel: "Use PIN",
      });

      if (result.success) {
        handleSuccess();
      }
    } catch (e) {
      log("Biometric error", e);
    } finally {
      setIsVerifying(false);
    }
  };

  const handlePinComplete = async (pin: string) => {
    try {
      setIsVerifying(true);
      setError("");

      if (isSetup) {
        if (setupStep === "enter") {
          setFirstPin(pin);
          setSetupStep("confirm");
          setIsVerifying(false);
          return;
        } else {
          if (pin !== firstPin) {
            setError("PINs do not match. Try again.");
            setSetupStep("enter");
            setFirstPin("");
            setIsVerifying(false);
            return;
          }
          await authService.setupPin(pin);
          await refreshUser(); // refresh so globalAccountLockEnabled toggle updates
          themedAlert("Success", "PIN setup complete.");
          handleSuccess();
          return;
        }
      }

      // Verify against backend
      await authService.verifyPin(pin);

      if (isDisable) {
        await authService.removePin(pin);
        await SecureStore.deleteItemAsync('wallet_pinEnabled');
        await SecureStore.deleteItemAsync('wallet_biometricEnabled');
        await SecureStore.deleteItemAsync('app_biometricEnabled');
        await refreshUser(); // refresh so globalAccountLockEnabled toggle updates
        if (fetchWalletData) {
          await fetchWalletData(); // refresh wallet context to sync local locks instantly
        }
        themedAlert("Success", "Global Account Lock disabled.");
      } else if (isVerifyToEnable) {
        await authService.toggleGlobalAccountLock(pin, true);
        await refreshUser();
        themedAlert("Success", "Global Account Lock enabled.");
      }

      handleSuccess();
    } catch (e: any) {
      const errMsg: string = e?.response?.data?.message || e?.message || 'Invalid PIN';
      
      // Backend auto-healed corrupt state (lock enabled but no PIN hash)
      // The lock is now cleared server-side — treat it as success since they are now unlocked!
      if (errMsg.toLowerCase().includes('not set up') || errMsg.toLowerCase().includes('lock has been disabled')) {
        await refreshUser();
        // Just let them through — whether they were disabling the lock, or trying to access the wallet,
        // the lock is now gone so they are allowed to proceed.
        handleSuccess();
        return;
      }

      setError(errMsg);
      if (isSetup) {
        setSetupStep("enter");
        setFirstPin("");
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSuccess = () => {
    // For setup/disable flows, just go back to the existing screen (avoids
    // pushing a duplicate Settings screen onto the stack).
    // For pure verify flows (e.g. unlocking wallet) navigate to target.
    if (isSetup || isDisable || isVerifyToEnable) {
      router.back();
    } else if (returnScreen) {
      // Replace ensures the lock screen is popped from the stack and
      // immediately replaced by the target route without parent-traversal.
      router.replace(returnScreen as never);
    } else {
      router.back();
    }
  };

  const title = isSetup
    ? setupStep === "enter"
      ? "Create a 4-digit PIN"
      : "Confirm your PIN"
    : isDisable
      ? "Enter PIN to Disable Global Account Lock"
      : isVerifyToEnable
        ? "Enter PIN to Enable Global Account Lock"
        : mode === "app" 
          ? "Enter Account PIN" 
          : "Enter Wallet PIN";

  const subtitle = "Please enter your 4-digit PIN to continue";

  const handleLogout = () => {
    themedAlert(
      "Log Out",
      "Are you sure you want to log out? This will bring you back to the login screen.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log Out",
          style: "destructive",
          onPress: () => signOut(),
        },
      ],
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.bg.base }]}
    >
      {router.canGoBack() && (
        <TouchableOpacity
          style={[styles.backBtnWrapper, { top: insets.top + spacing.sm }]}
          onPress={() => router.back()}
        >
          <View style={[styles.backBtnInner, { backgroundColor: colors.bg.surface }]}>
            <Ionicons
              name="arrow-back"
              size={24}
              color={colors.text.primary}
            />
          </View>
        </TouchableOpacity>
      )}
      <PinPad
        title={title}
        subtitle={subtitle}
        length={4}
        onPinComplete={handlePinComplete}
        onBiometric={triggerBiometric}
        showBiometric={showBiometric && !isSetup}
        error={error}
        isVerifying={isVerifying}
        resetKey={setupStep}
        clearError={() => setError("")}
      />
      {mode === "app" && !isSetup && (
        <>
          <TouchableOpacity style={styles.forgotBtn} onPress={() => setRemovePinVisible(true)}>
            <Text style={[styles.forgotText, { color: colors.primaryLight }]}>Forgot PIN?</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={[styles.logoutText, { color: colors.danger }]}>Log out</Text>
          </TouchableOpacity>
        </>
      )}

      <RemovePinModal
        visible={removePinVisible}
        onClose={() => setRemovePinVisible(false)}
        onSuccess={() => {
          setRemovePinVisible(false);
          refreshUser();
          if (fetchWalletData) fetchWalletData();
          router.back();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backBtnWrapper: {
    position: "absolute",
    left: spacing.md,
    zIndex: 10,
  },
  backBtnInner: {
    padding: spacing.sm,
    borderRadius: 50,
  },
  forgotBtn: {
    padding: spacing.sm,
    alignItems: "center",
    marginBottom: spacing.xs,
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
