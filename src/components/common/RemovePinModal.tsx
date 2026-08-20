import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "../../context/ThemeContext";
import { fontSizes, spacing, radii } from "../../theme";
import { authService } from "../../services/auth.service";
import { themedAlert } from "./ThemedAlert";

interface RemovePinModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RemovePinModal({
  visible,
  onClose,
  onSuccess,
}: RemovePinModalProps) {
  const colors = useThemeColors();

  const [step, setStep] = useState<"send-otp" | "verify">("send-otp");
  const [password, setPassword] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [hasPhone, setHasPhone] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);

  const passwordRef = useRef<TextInput>(null);
  const emailOtpRef = useRef<TextInput>(null);
  const phoneOtpRef = useRef<TextInput>(null);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setStep("send-otp");
      setPassword("");
      setEmailOtp("");
      setPhoneOtp("");
      setError("");
      setCountdown(0);
    }
  }, [visible]);

  const handleSendOtp = async () => {
    if (!password.trim()) {
      setError("Password is required");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const result = await authService.removePinSendOtp();
      setHasPhone(result.data?.hasPhone ?? false);
      setEmail(result.data?.email ?? "");
      setStep("verify");
      setCountdown(60);
    } catch (e: any) {
      setError(
        e?.response?.data?.message || e?.message || "Failed to send OTP"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!emailOtp.trim()) {
      setError("Email OTP is required");
      return;
    }
    if (hasPhone && !phoneOtp.trim()) {
      setError("Phone OTP is required");
      return;
    }
    try {
      setLoading(true);
      setError("");
      await authService.removePinVerify(password, emailOtp, phoneOtp || undefined);
      themedAlert("Success", "Global lock has been disabled. You can now set a new PIN from Settings.");
      onSuccess();
    } catch (e: any) {
      setError(
        e?.response?.data?.message || e?.message || "Verification failed"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    try {
      setLoading(true);
      await authService.removePinSendOtp();
      setCountdown(60);
      themedAlert("OTP Sent", "A new OTP has been sent to your email" + (hasPhone ? " and phone" : "") + ".");
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to resend OTP");
    } finally {
      setLoading(false);
    }
  };

  const maskedEmail = email
    ? `${email.substring(0, 2)}***@${email.split("@")[1]}`
    : "";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg.base }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="arrow-back" size={24} color={colors.text.secondary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
            Remove PIN
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {step === "send-otp" ? (
              <>
                {/* Step 1: Enter password */}
                <View style={styles.iconContainer}>
                  <View style={[styles.iconCircle, { backgroundColor: "rgba(124,58,237,0.12)" }]}>
                    <Ionicons name="lock-open-outline" size={32} color={colors.primaryLight} />
                  </View>
                </View>
                <Text style={[styles.title, { color: colors.text.primary }]}>
                  Verify Your Identity
                </Text>
                <Text style={[styles.subtitle, { color: colors.text.muted }]}>
                  Enter your account password to receive OTPs on your registered email and phone.
                </Text>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.text.muted }]}>
                    Account Password
                  </Text>
                  <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.bg.card }]}>
                    <Ionicons name="key-outline" size={18} color={colors.text.muted} style={styles.inputIcon} />
                    <TextInput
                      ref={passwordRef}
                      style={[styles.input, { color: colors.text.primary }]}
                      placeholder="Enter your password"
                      placeholderTextColor={colors.text.muted}
                      secureTextEntry
                      value={password}
                      onChangeText={(t) => { setPassword(t); setError(""); }}
                      autoCapitalize="none"
                      onSubmitEditing={handleSendOtp}
                      returnKeyType="done"
                    />
                  </View>
                </View>

                {error ? (
                  <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
                ) : null}

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.primaryLight }]}
                  onPress={handleSendOtp}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Send OTP</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* Step 2: Enter OTPs */}
                <View style={styles.iconContainer}>
                  <View style={[styles.iconCircle, { backgroundColor: "rgba(16,185,129,0.12)" }]}>
                    <Ionicons name="mail-open-outline" size={32} color="#10B981" />
                  </View>
                </View>
                <Text style={[styles.title, { color: colors.text.primary }]}>
                  Enter OTPs
                </Text>
                <Text style={[styles.subtitle, { color: colors.text.muted }]}>
                  We sent a 6-digit code to {maskedEmail}
                  {hasPhone ? " and your phone" : ""}
                </Text>

                {/* Email OTP */}
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.text.muted }]}>
                    Email OTP
                  </Text>
                  <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.bg.card }]}>
                    <Ionicons name="mail-outline" size={18} color={colors.text.muted} style={styles.inputIcon} />
                    <TextInput
                      ref={emailOtpRef}
                      style={[styles.input, { color: colors.text.primary }]}
                      placeholder="6-digit email OTP"
                      placeholderTextColor={colors.text.muted}
                      keyboardType="number-pad"
                      maxLength={6}
                      value={emailOtp}
                      onChangeText={(t) => { setEmailOtp(t); setError(""); }}
                      onSubmitEditing={() => hasPhone ? phoneOtpRef.current?.focus() : handleVerify()}
                      returnKeyType={hasPhone ? "next" : "done"}
                    />
                  </View>
                </View>

                {/* Phone OTP */}
                {hasPhone && (
                  <View style={styles.fieldGroup}>
                    <Text style={[styles.fieldLabel, { color: colors.text.muted }]}>
                      Phone OTP
                    </Text>
                    <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.bg.card }]}>
                      <Ionicons name="call-outline" size={18} color={colors.text.muted} style={styles.inputIcon} />
                      <TextInput
                        ref={phoneOtpRef}
                        style={[styles.input, { color: colors.text.primary }]}
                        placeholder="6-digit phone OTP"
                        placeholderTextColor={colors.text.muted}
                        keyboardType="number-pad"
                        maxLength={6}
                        value={phoneOtp}
                        onChangeText={(t) => { setPhoneOtp(t); setError(""); }}
                        onSubmitEditing={handleVerify}
                        returnKeyType="done"
                      />
                    </View>
                  </View>
                )}

                {error ? (
                  <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
                ) : null}

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.primaryLight }]}
                  onPress={handleVerify}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Verify & Disable Lock</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.resendBtn, countdown > 0 && { opacity: 0.5 }]}
                  onPress={handleResend}
                  disabled={countdown > 0 || loading}
                >
                  <Text style={[styles.resendText, { color: colors.primaryLight }]}>
                    {countdown > 0 ? `Resend OTP in ${countdown}s` : "Resend OTP"}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128,128,128,0.15)",
  },
  headerTitle: { fontSize: fontSizes.lg, fontWeight: "700" },
  scrollContent: {
    padding: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: 60,
  },
  iconContainer: { alignItems: "center", marginBottom: spacing.lg },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: fontSizes.xl,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSizes.sm,
    textAlign: "center",
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  fieldGroup: { marginBottom: spacing.md },
  fieldLabel: {
    fontSize: fontSizes.xs,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  inputIcon: { marginRight: spacing.sm },
  input: {
    flex: 1,
    fontSize: fontSizes.md,
    height: "100%",
  },
  errorText: {
    fontSize: fontSizes.xs,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  primaryBtn: {
    height: 48,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: fontSizes.md,
    fontWeight: "700",
  },
  resendBtn: {
    alignItems: "center",
    marginTop: spacing.lg,
  },
  resendText: {
    fontSize: fontSizes.sm,
    fontWeight: "600",
  },
});
