import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Alert,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, fontSizes, spacing } from "../../theme";
import Button from "../../components/common/Button";
import type { AuthStackParamList } from "../../types";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import * as AppleAuthentication from "expo-apple-authentication";
import { useAuth } from "../../context/AuthContext";
import { authService } from "../../services/auth.service";
import * as AuthSession from "expo-auth-session";
import * as Linking from "expo-linking";

WebBrowser.maybeCompleteAuthSession();

import Constants from "expo-constants";

const { height } = Dimensions.get("window");
type Props = NativeStackScreenProps<AuthStackParamList, "Welcome">;

export default function WelcomeScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const [appleAuthAvailable, setAppleAuthAvailable] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAuthAvailable);
  }, []);

  const webId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const androidId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const iosId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const hasGoogleConfig = !!webId || !!iosId || !!androidId;

  const handleGoogleLogin = async () => {
    if (!hasGoogleConfig || !webId) {
      Alert.alert(
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
        const { action, socialToken, data, accessToken, refreshToken, error } =
          urlParams.queryParams || {};

        if (error) {
          Alert.alert(
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
          await signIn(accessToken as string, refreshToken as string);
        } else {
          Alert.alert("Error", "Authentication failed. Tokens not received.");
        }
      }
    } catch (error: any) {
      if (error.code !== "ERR_REQUEST_CANCELED") {
        Alert.alert("Error", error.message);
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
            if (!accessToken) throw new Error("Could not extract access token");
            await signIn(accessToken, refreshToken);
          } catch (e: any) {
            alert(
              e instanceof Error ? e.message : "Apple Login failed on backend",
            );
          }
        }
      } catch (e: any) {
        if (e.code !== "ERR_REQUEST_CANCELED") {
          Alert.alert("Apple Sign-In Error", e.message);
        }
      }
    } else {
      const appleServiceId = process.env.EXPO_PUBLIC_APPLE_SERVICE_ID;
      const webUrl =
        process.env.EXPO_PUBLIC_BACKEND_URL || "https://taddlebox.com";

      if (!appleServiceId) {
        Alert.alert(
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
            error,
          } = urlParams.queryParams || {};

          if (error) {
            Alert.alert(
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
            await signIn(accessToken as string, refreshToken as string);
          } else {
            Alert.alert("Error", "Authentication failed. Tokens not received.");
          }
        }
      } catch (error: any) {
        Alert.alert("Error", error.message);
      }
    }
  };

  return (
    <LinearGradient colors={["#070714", "#0f0a2e"]} style={styles.container}>
      <StatusBar style="light" />

      {/* Background glow */}
      <View style={styles.glow} />

      {/* Logo */}
      <View style={styles.logoSection}>
        <LinearGradient
          colors={[colors.primary, colors.cyanDark]}
          style={styles.iconBox}
        >
          <Text style={styles.iconEmoji}>⚡</Text>
        </LinearGradient>
        <Text style={styles.brand}>
          <Text style={styles.brandW}>TADDL</Text>
          <Text style={styles.brandG}>EBOX</Text>
        </Text>
        <Text style={styles.tagline}>
          To rant, spill, overshare & have zero regrets about it.
        </Text>
      </View>

      {/* Feature highlights */}
      <View style={styles.features}>
        {[
          { icon: "trophy", text: "Earn XP & real cash rewards" },
          { icon: "game-controller", text: "Play games & climb leaderboards" },
          { icon: "people", text: "Join 100k+ communities" },
          { icon: "calendar", text: "Attend events & hackathons" },
        ].map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Ionicons
                name={f.icon as any}
                size={16}
                color={colors.primaryLight}
              />
            </View>
            <Text style={styles.featureText}>{f.text}</Text>
          </View>
        ))}
      </View>

      {/* CTA buttons */}
      <View style={styles.actions}>
        <Button
          label="Create Account"
          onPress={() => navigation.navigate("Register")}
          variant="primary"
          fullWidth
          leftEmoji="🚀"
        />
        <Button
          label="Log In"
          onPress={() => navigation.navigate("Login")}
          variant="ghost"
          fullWidth
          style={{ marginTop: 12 }}
        />

        {/* Social logins */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or continue with</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.socialRow}>
          <TouchableOpacity
            style={styles.socialBtn}
            onPress={handleGoogleLogin}
          >
            <Ionicons
              name="logo-google"
              size={18}
              color={colors.text.primary}
            />
            <Text style={styles.socialLabel}>Google</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.socialBtn} onPress={handleAppleLogin}>
            <Ionicons name="logo-apple" size={18} color={colors.text.primary} />
            <Text style={styles.socialLabel}>Apple</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.terms}>
          By continuing you agree to our{" "}
          <Text style={{ color: colors.primaryLight }}>Terms</Text> and{" "}
          <Text style={{ color: colors.primaryLight }}>Privacy Policy</Text>
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  glow: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: "rgba(124,58,237,0.1)",
    top: height * 0.1,
    alignSelf: "center",
  },
  logoSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  iconBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 10,
  },
  iconEmoji: { fontSize: 40 },
  brand: {
    fontSize: fontSizes.display - 6,
    fontWeight: "800",
    letterSpacing: -1,
  },
  brandW: { color: "#fff" },
  brandG: { color: colors.primaryLight },
  tagline: {
    fontSize: fontSizes.md,
    color: colors.text.muted,
    marginTop: 6,
    letterSpacing: 0.3,
  },
  features: {
    gap: 10,
    marginBottom: 28,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: "rgba(124,58,237,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: { fontSize: fontSizes.sm, color: colors.text.secondary },
  actions: { paddingBottom: 40 },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 20,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: fontSizes.xs, color: colors.text.muted },
  socialRow: { flexDirection: "row", gap: 12 },
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
  terms: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    textAlign: "center",
    marginTop: 18,
    lineHeight: 18,
  },
});
