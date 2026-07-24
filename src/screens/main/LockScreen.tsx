import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  SafeAreaView,
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

export default function LockScreen() {
  const colors = useThemeColors();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();

  // mode: 'app' | 'wallet'
  // isSetup: if true, we are creating a new PIN
  // isDisable: if true, we are removing the PIN
  // returnScreen: screen to navigate back to upon success
  const {
    mode = "wallet",
    returnScreen = "WalletMain",
    isSetup = false,
    isDisable = false,
  } = route.params || {};

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
      }

      handleSuccess();
    } catch (e: any) {
      setError(e.response?.data?.message || "Invalid PIN");
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
    // For pure verify flows (e.g. unlocking wallet) replace with the target.
    if (isSetup || isDisable) {
      navigation.goBack();
    } else if (returnScreen) {
      navigation.replace(returnScreen);
    } else {
      navigation.goBack();
    }
  };

  let title = mode === "app" ? "Enter App Lock PIN" : "Enter Wallet PIN";
  let subtitle = "Please enter your 4-digit PIN to continue";

  if (isSetup) {
    title = setupStep === "enter" ? "Create PIN" : "Confirm PIN";
    subtitle =
      setupStep === "enter"
        ? "Enter a new 4-digit PIN"
        : "Re-enter your PIN to confirm";
  } else if (isDisable) {
    title = "Disable App Lock";
    subtitle = "Enter your current PIN to disable";
  }

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
      style={[styles.container, { backgroundColor: colors.bg.main }]}
    >
      {navigation.canGoBack() && (
        <TouchableOpacity
          style={styles.backBtnWrapper}
          onPress={() => navigation.goBack()}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={colors.text.primary}
            style={{
              paddingTop: 30,
              paddingRight: 15,
              paddingBottom: 50,
              paddingLeft: 10,
              backgroundColor: "#f0f0f0",
              borderRadius: 50,
            }}
          />
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
    top: spacing.md,
    left: spacing.md,
    zIndex: 10,
    padding: spacing.sm,
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
