import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,

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
import { useAuth } from "../../context/AuthContext";
import type { AuthStackParamList } from "../../types";
import * as WebBrowser from "expo-web-browser";
import * as AppleAuthentication from "expo-apple-authentication";
import LottieView from "lottie-react-native";
import { getCachedLottie, getCachedLottieSync, S3_APP_ICON_LOTTIE_URL } from "../../services/lottie.service";
import { authService } from "../../services/auth.service";
import * as AuthSession from "expo-auth-session";
import * as Linking from "expo-linking";

WebBrowser.maybeCompleteAuthSession();

import Constants from "expo-constants";
import { themedAlert } from '../../components/common/ThemedAlert';

const { height } = Dimensions.get("window");
type Props = NativeStackScreenProps<AuthStackParamList, "Welcome">;

export default function WelcomeScreen({ navigation }: Props) {
  const { colors: themeColors, isDark } = useTheme();
  const styles = React.useMemo(() => getStyles(themeColors, isDark), [themeColors, isDark]);
  const { signIn, setIsAuthenticating } = useAuth();
  const [appleAuthAvailable, setAppleAuthAvailable] = useState(false);
  const [lottieSource, setLottieSource] = useState<any>(getCachedLottieSync(S3_APP_ICON_LOTTIE_URL));

  useEffect(() => {
    getCachedLottie(S3_APP_ICON_LOTTIE_URL).then((animData) => {
      if (animData) setLottieSource(animData);
    });
  }, []);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAuthAvailable);
  }, []);

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
        const { action, socialToken, data, accessToken, refreshToken, error } =
          urlParams.queryParams || {};

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
            await signIn(accessToken as string, refreshToken as string);
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
            if (!accessToken) throw new Error("Could not extract access token");
            await signIn(accessToken, refreshToken);
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
              await signIn(accessToken as string, refreshToken as string);
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
    <LinearGradient colors={[themeColors.bg.base, themeColors.bg.surface]} style={styles.container}>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Background glow */}
      <View style={styles.glow} />

      {/* Logo */}
      <View style={[styles.logoSection, { alignItems: 'center', justifyContent: 'center' }]}>
        {lottieSource ? (
          <View style={{ width: 120, height: 120, borderRadius: 60, overflow: 'hidden', marginBottom: 24, backgroundColor: 'transparent' }}>
            <LottieView
              source={lottieSource}
              autoPlay
              loop
              cacheComposition={false}
              style={{ width: '100%', height: '100%' }}
            />
          </View>
        ) : (
          <Image 
            source={require('../../../TaddleBox_Logo.png')} 
            style={{ width: 120, height: 120, borderRadius: 60, resizeMode: 'cover', marginBottom: 24 }} 
          />
        )}
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
          { icon: "calendar", text: "Book events & happenings" },
        ].map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Ionicons
                name={f.icon as any}
                size={16}
                color={themeColors.primaryLight}
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
          leftEmoji=""
        />
        <Button
          label="Log In"
          onPress={() => navigation.navigate("Login")}
          variant="secondary"
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
              color={themeColors.text.primary}
            />
            <Text style={styles.socialLabel}>Google</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.socialBtn} onPress={handleAppleLogin}>
            <Ionicons name="logo-apple" size={18} color={themeColors.text.primary} />
            <Text style={styles.socialLabel}>Apple</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.terms}>
          By continuing you agree to our{" "}
          <Text onPress={() => navigation.navigate('Terms')} style={{ color: themeColors.primaryLight }}>Terms</Text> and{" "}
          <Text onPress={() => navigation.navigate('Privacy')} style={{ color: themeColors.primaryLight }}>Privacy Policy</Text>
        </Text>
      </View>
    </LinearGradient>
  );
}

const getStyles = (themeColors: any, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  glow: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: isDark ? "rgba(124,58,237,0.1)" : "rgba(124,58,237,0.05)",
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
    shadowColor: themeColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: isDark ? 0.7 : 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  iconEmoji: { fontSize: 40 },
  brand: {
    fontSize: fontSizes.display - 6,
    fontWeight: "800",
    letterSpacing: -1,
  },
  brandW: { color: themeColors.text.primary },
  brandG: { color: themeColors.primaryLight },
  tagline: {
    fontSize: fontSizes.md,
    color: themeColors.text.muted,
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
    backgroundColor: isDark ? "rgba(124,58,237,0.15)" : "rgba(124,58,237,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: { fontSize: fontSizes.sm, color: themeColors.text.secondary },
  actions: { paddingBottom: 40 },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 20,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: themeColors.border },
  dividerText: { fontSize: fontSizes.xs, color: themeColors.text.muted },
  socialRow: { flexDirection: "row", gap: 12 },
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
  terms: {
    fontSize: fontSizes.xs,
    color: themeColors.text.muted,
    textAlign: "center",
    marginTop: 18,
    lineHeight: 18,
  },
});
