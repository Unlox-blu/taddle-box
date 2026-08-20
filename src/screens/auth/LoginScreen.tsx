import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { radii, fontSizes, spacing } from "../../theme";
import { useTheme } from "../../context/ThemeContext";
import Button from "../../components/common/Button";
import Input from "../../components/common/Input";
import type { AuthStackParamList } from "../../types";
import { useAuth } from "../../context/AuthContext";
import { authService } from "../../services/auth.service";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import * as AppleAuthentication from "expo-apple-authentication";
import * as AuthSession from "expo-auth-session";
import * as Linking from "expo-linking";
import LottieView from "lottie-react-native";
import {
  getCachedLottie,
  getCachedLottieSync,
  S3_APP_ICON_LOTTIE_URL,
} from "../../services/lottie.service";

WebBrowser.maybeCompleteAuthSession();

import Constants from "expo-constants";
import { themedAlert } from "../../components/common/ThemedAlert";
import SwitchAccountSection from "../../components/common/SwitchAccountSection";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export default function LoginScreen({ navigation }: Props) {
  const { colors: themeColors, isDark } = useTheme();
  const styles = React.useMemo(
    () => getStyles(themeColors, isDark),
    [themeColors, isDark],
  );
  const { signIn, isAuthenticating, setIsAuthenticating, accounts, user } =
    useAuth();
  const hasAccounts = accounts.length > 0 || !!user?.id;
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [appleAuthAvailable, setAppleAuthAvailable] = useState(false);
  const [lottieSource, setLottieSource] = useState<any>(
    getCachedLottieSync(S3_APP_ICON_LOTTIE_URL),
  );

  useEffect(() => {
    getCachedLottie(S3_APP_ICON_LOTTIE_URL).then((animData) => {
      if (animData) setLottieSource(animData);
    });
  }, []);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAuthAvailable);
  }, []);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!identifier.trim())
      e.identifier = "Email, phone or username is required";
    if (!password.trim()) e.password = "Password is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setIsAuthenticating(true);
    try {
      const res = await authService.login(identifier.trim(), password);
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
      const sessionId =
        res.data?.sessionData?.sessionId ||
        res.sessionData?.sessionId ||
        res.data?.sessionId;
      await signIn(accessToken, refreshToken, sessionId);
    } catch (e: any) {
      alert(e instanceof Error ? e.message : "Login failed");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const webId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const androidId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const iosId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const hasGoogleConfig = !!webId || !!iosId || !!androidId;

  const handleGoogleLogin = async () => {
    if (!hasGoogleConfig || !webId) {
      themedAlert(
        "Service Unavailable",
        "Google Sign-In is currently unavailable on this platform.",
      );
      return;
    }

    try {
      const webUrl =
        process.env.EXPO_PUBLIC_BACKEND_URL || "https://taddlebox.com";
      const redirectUri = `${webUrl}/api/v1/auth/google/callback`;
      const returnUrl = Linking.createURL("google-auth");
      const state = encodeURIComponent(JSON.stringify({ returnUrl }));
      const nonce = Math.random().toString(36).substring(2);

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${webId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=id_token&response_mode=form_post&scope=openid%20profile%20email&state=${state}&nonce=${nonce}`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl);

      if (result.type === "success" && result.url) {
        const urlParams = Linking.parse(result.url);
        const {
          action,
          socialToken,
          data,
          accessToken,
          refreshToken,
          sessionId,
          error,
        } = urlParams.queryParams || {};

        if (error) {
          themedAlert(
            "Google Sign-In Error",
            decodeURIComponent(error as string),
          );
          return;
        }

        if (action === "REGISTER_SOCIAL" && socialToken && data) {
          const socialData = JSON.parse(decodeURIComponent(data as string));
          // @ts-ignore
          navigation.navigate("Register", {
            socialToken: socialToken as string,
            socialData,
          });
          return;
        }

        if (accessToken && refreshToken) {
          setIsAuthenticating(true);
          try {
            await signIn(
              accessToken as string,
              refreshToken as string,
              sessionId as string | undefined,
            );
          } finally {
            setIsAuthenticating(false);
          }
        } else {
          themedAlert("Error", "Authentication failed. Tokens not received.");
        }
      }
    } catch (error: any) {
      if (error.code !== "ERR_REQUEST_CANCELED") {
        themedAlert("Error", error.message);
      }
    }
  };

  const handleAppleLogin = async () => {
    if (appleAuthAvailable) {
      try {
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });

        const fullName = credential.fullName?.givenName
          ? `${credential.fullName.givenName} ${credential.fullName.familyName || ""}`.trim()
          : undefined;

        if (credential.identityToken) {
          setIsAuthenticating(true);
          try {
            const res = await authService.appleLogin(
              credential.identityToken,
              fullName,
            );
            const resultData = res.data || res;

            if (resultData.action === "REGISTER_SOCIAL") {
              // @ts-ignore
              navigation.navigate("Register", {
                socialToken: resultData.socialToken,
                socialData: resultData.data,
              });
              return;
            }

            const accessToken =
              resultData.sessionData?.accessToken || resultData.accessToken;
            const refreshToken =
              resultData.sessionData?.refreshToken || resultData.refreshToken;
            const sessionId =
              resultData.sessionData?.sessionId || resultData.sessionId;
            if (!accessToken) throw new Error("Could not extract access token");
            await signIn(accessToken, refreshToken, sessionId);
          } catch (e: any) {
            alert(
              e instanceof Error ? e.message : "Apple Login failed on backend",
            );
          } finally {
            setIsAuthenticating(false);
          }
        }
      } catch (e: any) {
        if (e.code !== "ERR_REQUEST_CANCELED") {
          themedAlert("Apple Sign-In Error", e.message);
        }
      }
    } else {
      const appleServiceId = process.env.EXPO_PUBLIC_APPLE_SERVICE_ID;
      const webUrl =
        process.env.EXPO_PUBLIC_BACKEND_URL || "https://taddlebox.com";

      if (!appleServiceId) {
        themedAlert(
          "Service Unavailable",
          "Apple Sign-In is currently unavailable on this platform.",
        );
        return;
      }

      try {
        const redirectUri = `${webUrl}/auth/apple/callback`;
        const returnUrl = Linking.createURL("apple-auth");
        const state = encodeURIComponent(JSON.stringify({ returnUrl }));

        const authUrl = `https://appleid.apple.com/auth/authorize?client_id=${appleServiceId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code%20id_token&response_mode=form_post&scope=name%20email&state=${state}`;

        const result = await WebBrowser.openAuthSessionAsync(
          authUrl,
          returnUrl,
        );

        if (result.type === "success" && result.url) {
          const urlParams = Linking.parse(result.url);
          const {
            action,
            socialToken,
            data,
            accessToken,
            refreshToken,
            sessionId,
            error,
          } = urlParams.queryParams || {};

          if (error) {
            themedAlert(
              "Apple Sign-In Error",
              decodeURIComponent(error as string),
            );
            return;
          }

          if (action === "REGISTER_SOCIAL" && socialToken && data) {
            const socialData = JSON.parse(decodeURIComponent(data as string));
            // @ts-ignore
            navigation.navigate("Register", {
              socialToken: socialToken as string,
              socialData,
            });
            return;
          }

          if (accessToken && refreshToken) {
            setIsAuthenticating(true);
            try {
              await signIn(
                accessToken as string,
                refreshToken as string,
                sessionId as string | undefined,
              );
            } finally {
              setIsAuthenticating(false);
            }
          } else {
            themedAlert("Error", "Authentication failed. Tokens not received.");
          }
        }
      } catch (error: any) {
        themedAlert("Error", error.message);
      }
    }
  };

  return (
    <LinearGradient
      colors={[themeColors.bg.base, themeColors.bg.surface]}
      style={styles.container}
    >
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* On Android the window already resizes natively (adjustResize) and the
          ScrollView auto-scrolls the focused field into view — a height-based
          KeyboardAvoidingView fights that and hides inputs under the keyboard. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Back */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.back}
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color={themeColors.text.secondary}
            />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            {lottieSource ? (
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  overflow: "hidden",
                  marginBottom: 12,
                  marginLeft: -8,
                  backgroundColor: "transparent",
                }}
              >
                <LottieView
                  source={lottieSource}
                  autoPlay
                  loop
                  cacheComposition={false}
                  style={{ width: "100%", height: "100%" }}
                />
              </View>
            ) : (
              <Image
                source={require("../../../TaddleBox_Logo.png")}
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  resizeMode: "cover",
                  alignSelf: "flex-start",
                  marginBottom: 12,
                  marginLeft: -8,
                }}
              />
            )}
            <Text style={styles.title}>Welcome back taddler!</Text>
            <Text style={styles.subtitle}>Log in to continue taddling</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Input
              label="Email, Phone or Username"
              icon="person-outline"
              value={identifier}
              onChangeText={(text) => {
                setIdentifier(text);
                setErrors({});
              }}
              placeholder="Email, phone or username"
              keyboardType="default"
              autoCapitalize="none"
              autoCorrect={false}
              error={errors.identifier}
              forceDark={isDark}
            />
            <Input
              label="Password"
              icon="lock-closed-outline"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              error={errors.password}
              forceDark={isDark}
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
              loading={isAuthenticating}
              variant="primary"
              fullWidth
              style={{ marginTop: 8 }}
            />
          </View>

          {hasAccounts && (
            <>
              {/* Divider */}
              <View
                style={[styles.dividerRow, { marginTop: 20, marginBottom: 16 }]}
              >
                <View style={styles.line} />
                <Text style={styles.dividerText}>or continue as</Text>
                <View style={styles.line} />
              </View>

              {/* Show logged-in accounts if any exist (Instagram-style) */}
              <View style={{ alignItems: "center", marginBottom: 20 }}>
                <SwitchAccountSection
                  onAddAccount={() => navigation.navigate("Login")}
                />
              </View>
            </>
          )}

          {/* Divider */}
          <View
            style={[
              styles.dividerRow,
              { marginTop: hasAccounts ? 0 : 20, marginBottom: 20 },
            ]}
          >
            <View style={styles.line} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.line} />
          </View>

          {/* Social */}
          <View style={styles.socialRow}>
            <TouchableOpacity
              style={styles.socialBtn}
              onPress={handleGoogleLogin}
            >
              <Ionicons
                name="logo-google"
                size={18}
                color={themeColors.text.primary}
              />
              <Text style={styles.socialLabel}>Google</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.socialBtn}
              onPress={handleAppleLogin}
            >
              <Ionicons
                name="logo-apple"
                size={18}
                color={themeColors.text.primary}
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

const getStyles = (themeColors: any, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1 },
    kav: { flex: 1 },
    scroll: { flexGrow: 1, padding: 24, paddingTop: 60, paddingBottom: 140 },
    back: {
      width: 40,
      height: 40,
      borderRadius: radii.md,
      backgroundColor: themeColors.bg.card,
      borderWidth: 1,
      borderColor: themeColors.border,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 28,
    },
    header: { marginBottom: 32 },
    title: {
      fontSize: fontSizes.h2,
      fontWeight: "800",
      color: themeColors.text.primary,
      marginBottom: 6,
    },
    subtitle: { fontSize: fontSizes.md, color: themeColors.text.muted },
    form: { gap: 2 },
    forgotRow: { alignItems: "flex-end", marginBottom: 4 },
    forgotText: {
      fontSize: fontSizes.sm,
      color: themeColors.primaryLight,
      fontWeight: "600",
    },
    dividerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginVertical: 28,
    },
    line: { flex: 1, height: 1, backgroundColor: themeColors.border },
    dividerText: { fontSize: fontSizes.xs, color: themeColors.text.muted },
    socialRow: { flexDirection: "row", gap: 12, marginBottom: 32 },
    socialBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: themeColors.bg.card,
      borderWidth: 1,
      borderColor: themeColors.borderHover,
      borderRadius: radii.md,
      paddingVertical: 12,
    },
    socialIcon: {
      fontSize: fontSizes.md,
      fontWeight: "800",
      color: themeColors.text.primary,
    },
    socialLabel: {
      fontSize: fontSizes.sm,
      color: themeColors.text.primary,
      fontWeight: "600",
    },
    registerRow: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
    },
    registerText: { fontSize: fontSizes.sm, color: themeColors.text.muted },
    registerLink: {
      fontSize: fontSizes.sm,
      color: themeColors.primaryLight,
      fontWeight: "700",
    },
  });
