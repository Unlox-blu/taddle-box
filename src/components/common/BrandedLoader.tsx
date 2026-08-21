import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, Image } from "react-native";
import LottieView from "lottie-react-native";
import { useThemeColors } from "../../context/ThemeContext";
import {
  getCachedLottie,
  getCachedLottieSync,
  S3_APP_ICON_LOTTIE_URL,
} from "../../services/lottie.service";

/**
 * Small, ROUNDED branded loader — the app-icon Lottie in a circle (same look
 * as the pull-to-refresh bubble), with a plain spinner fallback while the
 * animation isn't cached yet. Replaces bare ActivityIndicators across the
 * app's loading states for consistency.
 */
export default function BrandedLottieLoader({ size = 52 }: { size?: number }) {
  const colors = useThemeColors();
  const [lottieSource, setLottieSource] = useState<any>(
    getCachedLottieSync(S3_APP_ICON_LOTTIE_URL),
  );

  useEffect(() => {
    if (!lottieSource) {
      getCachedLottie(S3_APP_ICON_LOTTIE_URL).then((animData) => {
        if (animData) setLottieSource(animData);
      });
    }
  }, [lottieSource]);

  if (!lottieSource) {
    return <BrandedStaticLoader size={size} />;
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        backgroundColor: colors.bg.elevated,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <LottieView
        source={lottieSource}
        autoPlay
        loop
        cacheComposition={true}
        resizeMode="cover"
        style={{ width: "100%", height: "100%" }}
      />
    </View>
  );
}

/**
 * A purely static fallback that looks identical to BrandedLoader's container
 * but uses a static image. Perfect for use during React Navigation transitions
 * where initializing LottieView would block the main thread.
 */
export function BrandedStaticLoader({ size = 52 }: { size?: number }) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        backgroundColor: colors.bg.elevated,
        borderWidth: 1,
        borderColor: colors.border,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Image
        source={require("../../../assets/icon.png")}
        style={{ width: size, height: size, resizeMode: "cover" }}
      />
    </View>
  );
}
