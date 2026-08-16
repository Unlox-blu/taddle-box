import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
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
export default function BrandedLoader({ size = 52 }: { size?: number }) {
  const colors = useThemeColors();
  const [lottieSource, setLottieSource] = useState<any>(
    getCachedLottieSync(S3_APP_ICON_LOTTIE_URL),
  );

  useEffect(() => {
    getCachedLottie(S3_APP_ICON_LOTTIE_URL).then((animData) => {
      if (animData) setLottieSource(animData);
    });
  }, []);

  if (!lottieSource) {
    return <ActivityIndicator size="small" color={colors.primaryLight} />;
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
        cacheComposition={false}
        resizeMode="cover"
        style={{ width: "100%", height: "100%" }}
      />
    </View>
  );
}
