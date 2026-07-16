import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, fontSizes, spacing } from "../../theme";
import Button from "../../components/common/Button";
import Input from "../../components/common/Input";
import type { AuthStackParamList } from "../../types";
import { useAuth } from "../../context/AuthContext";
import { authService } from "../../services/auth.service";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export default function LoginScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!email.trim()) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = "Enter a valid email";
    if (!password.trim()) e.password = "Password is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await authService.login(email, password);
      const accessToken =
        res.data?.sessionData?.accessToken ||
        res.sessionData?.accessToken ||
        res.data?.accessToken ||
        res.data?.data?.sessionData?.accessToken;
      if (!accessToken)
        throw new Error("Could not extract access token from backend response");
      const refreshToken =
        res.data?.sessionData?.refreshToken ||
        res.sessionData?.refreshToken ||
        res.data?.refreshToken;
      await signIn(accessToken, refreshToken);
    } catch (e: any) {
      setErrors({ email: e.response?.data?.message || "Login failed" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={["#070714", "#0E0E24"]} style={styles.container}>
      <StatusBar style="light" />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.back}
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color={colors.text.secondary}
            />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Welcome back 👋</Text>
            <Text style={styles.subtitle}>Log in to continue your journey</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Input
              label="Email Address"
              icon="mail-outline"
              value={email}
              onChangeText={setEmail}
              placeholder="arjun@iitd.ac.in"
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
            />
            <Input
              label="Password"
              icon="lock-closed-outline"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              error={errors.password}
            />

            <TouchableOpacity
              onPress={() => navigation.navigate("ForgotPassword")}
              style={styles.forgotRow}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            <Button
              label="Log In"
              onPress={handleLogin}
              variant="primary"
              fullWidth
              loading={loading}
              style={{ marginTop: 8 }}
            />
          </View>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.line} />
          </View>

          {/* Social */}
          <View style={styles.socialRow}>
            <TouchableOpacity style={styles.socialBtn}>
              <Text style={styles.socialIcon}>G</Text>
              <Text style={styles.socialLabel}>Google</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.socialBtn}>
              <Ionicons
                name="logo-apple"
                size={18}
                color={colors.text.primary}
              />
              <Text style={styles.socialLabel}>Apple</Text>
            </TouchableOpacity>
          </View>

          {/* Sign up link */}
          <View style={styles.registerRow}>
            <Text style={styles.registerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate("Register")}>
              <Text style={styles.registerLink}>Sign up free →</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  kav: { flex: 1 },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 60 },
  back: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  header: { marginBottom: 32 },
  title: {
    fontSize: fontSizes.h2,
    fontWeight: "800",
    color: colors.text.primary,
    marginBottom: 6,
  },
  subtitle: { fontSize: fontSizes.md, color: colors.text.muted },
  form: { gap: 2 },
  forgotRow: { alignItems: "flex-end", marginBottom: 4 },
  forgotText: {
    fontSize: fontSizes.sm,
    color: colors.primaryLight,
    fontWeight: "600",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 28,
  },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: fontSizes.xs, color: colors.text.muted },
  socialRow: { flexDirection: "row", gap: 12, marginBottom: 32 },
  socialBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.borderHover,
    borderRadius: radii.md,
    paddingVertical: 12,
  },
  socialIcon: {
    fontSize: fontSizes.md,
    fontWeight: "800",
    color: colors.text.primary,
  },
  socialLabel: {
    fontSize: fontSizes.sm,
    color: colors.text.primary,
    fontWeight: "600",
  },
  registerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  registerText: { fontSize: fontSizes.sm, color: colors.text.muted },
  registerLink: {
    fontSize: fontSizes.sm,
    color: colors.primaryLight,
    fontWeight: "700",
  },
});
