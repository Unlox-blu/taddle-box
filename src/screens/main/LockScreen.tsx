import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  TouchableOpacity,
  Text,
} from "react-native";
import {
  useNavigation,
  useRoute,
  useFocusEffect,
} from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { useThemeColors } from "../../context/ThemeContext";
import { spacing, fontSizes } from "../../theme";
import PinPad from "../../components/common/PinPad";
import { authService } from "../../services/auth.service";
import { useAuth } from "../../context/AuthContext";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

export default function LockScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();

  // mode: 'app' | 'wallet'
  // isSetup: if true, we are creating a new PIN
  // isDisable: if true, we are removing the PIN
  // isVerifyToEnable: if true, we are verifying before enabling
  // returnScreen: screen to navigate back to upon success
  const { mode = "wallet" } = route.params || {};
  const isSetup = route.params?.isSetup || false;
  const isDisable = route.params?.isDisable || false;
  const isVerifyToEnable = route.params?.isVerifyToEnable || false;
  const returnScreen = route.params?.returnScreen || null;

  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [showBiometric, setShowBiometric] = useState(false);
  const [setupStep, setSetupStep] = useState<"enter" | "confirm">("enter");
  const [firstPin, setFirstPin] = useState("");
  const { signOut, refreshUser } = useAuth();

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
      console.log("Biometric error", e);
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
          await refreshUser(); // refresh so appLockEnabled toggle updates
          Alert.alert("Success", "PIN setup complete.");
          handleSuccess();
          return;
        }
      }

      // Verify against backend
      await authService.verifyPin(pin);

      if (isDisable) {
        await authService.removePin(pin);
        await refreshUser(); // refresh so appLockEnabled toggle updates
        Alert.alert("Success", "App Lock disabled.");
      } else if (isVerifyToEnable) {
        await authService.toggleGlobalAppLock(pin, true);
        await refreshUser();
        Alert.alert("Success", "Global App Lock enabled.");
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
      navigation.goBack();
    } else if (returnScreen) {
      // Tabs live in the parent (MainNavigator), so use getParent to navigate there
      navigation.goBack(); // first close the lock screen
      navigation.getParent()?.navigate(returnScreen as never);
    } else {
      navigation.goBack();
    }
  };

  const title = isSetup
    ? setupStep === "enter"
      ? "Create a 4-digit PIN"
      : "Confirm your PIN"
    : isDisable
      ? "Enter PIN to Disable App Lock"
      : isVerifyToEnable
        ? "Enter PIN to Enable App Lock"
        : mode === "app" 
          ? "Enter App Lock PIN" 
          : "Enter Wallet PIN";

  const subtitle = "Please enter your 4-digit PIN to continue";

  const handleLogout = () => {
    Alert.alert(
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
      {navigation.canGoBack() && (
        <TouchableOpacity
          style={[styles.backBtnWrapper, { top: insets.top + spacing.sm }]}
          onPress={() => navigation.goBack()}
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
      />
      {mode === "app" && !isSetup && !isDisable && (
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={[styles.logoutText, { color: colors.danger }]}>
            Log out
          </Text>
        </TouchableOpacity>
      )}
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
