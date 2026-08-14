import "react-native-gesture-handler";
import React, { useEffect } from "react";
import {
  StatusBar as RNStatusBar,
  AppState,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { getCachedLottie, S3_APP_ICON_LOTTIE_URL, S3_APP_BANNER_LOTTIE_URL } from "./src/services/lottie.service";
import AnimatedSplashScreen from "./src/components/common/AnimatedSplashScreen";
import AppNavigator from "./src/navigation/AppNavigator";
import { AuthProvider } from "./src/context/AuthContext";
import { PostsProvider } from "./src/context/PostsContext";
import { CommunityProvider } from "./src/context/CommunityContext";
import { WalletProvider } from "./src/context/WalletContext";
import { GamesProvider } from "./src/context/GamesContext";
import { NotificationProvider } from "./src/context/NotificationContext";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./src/lib/react-query";
import AppLockOverlay from "./src/components/common/AppLockOverlay";
import NotificationBanner from "./src/components/common/NotificationBanner";
import { ThemedAlertHost } from "./src/components/common/ThemedAlert";
import { PresenceProvider } from "./src/context/PresenceContext";
import { useAuth } from "./src/context/AuthContext";
import { locationService } from "./src/services/location.service";
import { initGameSound } from "./src/services/gameSound";
import AppErrorBoundary from "./src/components/common/AppErrorBoundary";

SplashScreen.preventAutoHideAsync();

// Warm up game audio + haptics prefs so the first match has zero startup latency
initGameSound();

// Inner shell reads theme so background + status bar react to light/dark toggle
function AppShell() {
  const { colors, isDark } = useTheme();

  const { isLoading, isSplashVisible, setLottieFinished } = useAuth();

  useEffect(() => {
    // Prefetch the Lotties in the background so they're ready for pull-to-refresh & headers!
    getCachedLottie(S3_APP_ICON_LOTTIE_URL).catch(() => {});
    getCachedLottie(S3_APP_BANNER_LOTTIE_URL).catch(() => {});
  }, []);

  useEffect(() => {
    // Hide the native static splash screen immediately, because our AnimatedSplashScreen is now handling it!
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: colors.bg.base }}
    >
      <SafeAreaProvider>
        <RNStatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={colors.bg.base}
        />
        
        {/* Render navigators underneath so they are ready */}
        {!isLoading && (
          <>
            <LocationTracker />
            <AppNavigator />
            <NotificationBanner />
            <AppLockOverlay />
            <ThemedAlertHost />
          </>
        )}

        {/* Global Lottie Splash Screen Overlay */}
        {isSplashVisible && (
          <AnimatedSplashScreen onAnimationFinish={() => setLottieFinished(true)} />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Captures the user's last location whenever the app comes to the foreground,
// but only if they already granted location permission (no prompt, throttled).
function LocationTracker() {
  const { isLoggedIn } = useAuth();

  useEffect(() => {
    if (isLoggedIn) locationService.captureIfPermitted();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && isLoggedIn) locationService.captureIfPermitted();
    });
    return () => sub.remove();
  }, [isLoggedIn]);

  return null;
}

/**
 * The full app, with an optional extra node rendered inside the theme tree.
 * Store builds (entry.store.js) call this with nothing. Direct/test builds
 * (entry.direct.js) pass the APK self-updater so it can read the theme —
 * and, because it's passed in rather than imported here, the updater module
 * never enters the store bundle at all.
 */
export function AppCore({ insideTheme }: { insideTheme?: React.ReactNode }) {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <WalletProvider>
              <GamesProvider>
                <CommunityProvider>
                  <PostsProvider>
                    <NotificationProvider>
                      <PresenceProvider>
                        {insideTheme}
                        <AppShell />
                      </PresenceProvider>
                    </NotificationProvider>
                  </PostsProvider>
                </CommunityProvider>
              </GamesProvider>
            </WalletProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

export default function App() {
  return <AppCore />;
}
