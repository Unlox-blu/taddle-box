import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Animated, Image, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import LottieView from "lottie-react-native";
import {
  getCachedLottie,
  getCachedLottieSync,
  S3_APP_ICON_LOTTIE_URL,
} from "../../services/lottie.service";
import { colors, fontSizes } from "../../theme";
import { useTheme } from "../../context/ThemeContext";

type Props = {
  onAnimationFinish: () => void;
  /** Called once the Lottie view has mounted and the next frame is available. */
  onReady?: () => void;
  /** When true, the splash will not dismiss even if animation finishes — waits for auth. */
  isAuthLoading?: boolean;
};

export default function AnimatedSplashScreen({
  onAnimationFinish,
  onReady,
  isAuthLoading = false,
}: Props) {
  const { width, height } = useWindowDimensions();
  const { colors: themeColors, isDark } = useTheme();
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const logoSlide = useRef(new Animated.Value(20)).current;
  const tagOpac = useRef(new Animated.Value(0)).current;

  const [lottieSource, setLottieSource] = React.useState<any>(
    getCachedLottieSync(S3_APP_ICON_LOTTIE_URL),
  );
  const [lottieMounted, setLottieMounted] = useState(false);
  const finishedRef = useRef(false);
  const animDoneRef = useRef(false);

  const hardDeadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const splashFade = useRef(new Animated.Value(1)).current;

  const dismiss = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (hardDeadlineRef.current) {
      clearTimeout(hardDeadlineRef.current);
      hardDeadlineRef.current = null;
    }
    setTimeout(() => {
      Animated.timing(splashFade, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        onAnimationFinish();
      });
    }, 200);
  };

  const handleFinish = () => {
    animDoneRef.current = true;
    // Wait for auth to finish before dismissing
    if (!isAuthLoading) dismiss();
  };

  // When auth finishes after animation already done, dismiss now
  useEffect(() => {
    if (!isAuthLoading && animDoneRef.current) {
      dismiss();
    }
  }, [isAuthLoading]);

  // Hard deadline — never get stuck regardless of what happens
  useEffect(() => {
    hardDeadlineRef.current = setTimeout(() => {
      hardDeadlineRef.current = null;
      dismiss();
    }, 7000);
    return () => {
      if (hardDeadlineRef.current) clearTimeout(hardDeadlineRef.current);
    };
  }, []);

  // Signal readiness when both the Lottie source is loaded AND the view has been laid out.
  useEffect(() => {
    if (lottieSource && lottieMounted) {
      requestAnimationFrame(() => {
        onReady?.();
      });
    }
  }, [lottieSource, lottieMounted]);

  useEffect(() => {
    getCachedLottie(S3_APP_ICON_LOTTIE_URL).then((animData) => {
      if (animData) setLottieSource(animData);
    });

    // Run the text and container intro animations
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 80,
          friction: 5,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(logoSlide, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 5,
        }),
      ]),
      Animated.timing(tagOpac, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Once Lottie source is known, tighten the hard deadline to actual duration + buffer.
  // This ensures one full loop plays but doesn't wait longer than needed.
  useEffect(() => {
    if (lottieSource && lottieSource.op && lottieSource.fr) {
      const inFrame = lottieSource.ip || 0;
      const outFrame = lottieSource.op;
      const frameRate = lottieSource.fr;
      const durationMs = ((outFrame - inFrame) / frameRate) * 1000;
      // Tighten the hard deadline to animation duration + 800ms buffer
      const tightDeadline = durationMs + 800;
      if (hardDeadlineRef.current) {
        clearTimeout(hardDeadlineRef.current);
      }
      hardDeadlineRef.current = setTimeout(() => {
        hardDeadlineRef.current = null;
        handleFinish();
      }, tightDeadline);
    }
  }, [lottieSource]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width,
          height,
          backgroundColor: themeColors.bg.base,
          opacity: splashFade,
        },
      ]}
    >
      <LinearGradient
        colors={[
          themeColors.bg.base,
          themeColors.bg.surface,
          themeColors.bg.base,
        ]}
        style={StyleSheet.absoluteFill}
      />
      {/* Ensures the gradient background is fully opaque before the native splash hides */}
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Full-width glow circle centered behind the logo */}
      <View style={[styles.glow, { width: width, height: width, borderRadius: width / 2 }]} />

      {/* Logo + glow as a single centered unit */}
      <Animated.View
        style={{
          opacity,
          transform: [{ scale }, { translateY: logoSlide }],
          alignItems: "center",
          justifyContent: "center",
          width: 180,
          height: 180,
        }}
      >
        {lottieSource ? (
          <View
            style={{
              width: 120,
              height: 120,
              borderRadius: 60,
              overflow: "hidden",
              backgroundColor: "transparent",
              position: "absolute",
            }}
            onLayout={() => setLottieMounted(true)}
          >
            <LottieView
              source={lottieSource}
              autoPlay
              loop={false}
              cacheComposition={true}
              style={{ width: "100%", height: "100%" }}
              onAnimationFinish={(isCancelled) => {
                if (!isCancelled) {
                  handleFinish();
                }
              }}
            />
          </View>
        ) : (
          <Image
            source={require("../../../TaddleBox_Logo.png")}
            style={{
              width: 120,
              height: 120,
              borderRadius: 60,
              resizeMode: "cover",
              position: "absolute",
            }}
          />
        )}
      </Animated.View>

      <Animated.Text style={[styles.tagline, { opacity: tagOpac }]}>
        Play · Earn · Connect
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    elevation: 9999,
  },
  glow: {
    position: "absolute",
    backgroundColor: "rgba(124,58,237,0.12)",
  },
  tagline: {
    position: "absolute",
    bottom: "12%",
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    letterSpacing: 0.4,
    fontWeight: "600",
  },
});
