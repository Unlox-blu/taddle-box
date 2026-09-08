import 'react-native-gesture-handler';

import React, { useEffect, useState } from 'react';
import { StatusBar as RNStatusBar, AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack, Redirect, usePathname, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useTheme } from '../design-system/theme/ThemeProvider';
import { useAuth } from '../features/auth/state/AuthProvider';
import { Providers } from '../shell/providers';
import { ScrollProvider } from '../shared/state/ScrollProvider';
import { AudioProvider } from '../shared/state/AudioProvider';
import { LoaderProvider } from '../shared/state/LoaderProvider';
import { AppUpdaterHost } from '../../app-updater/AppUpdaterHost';
import {
  getCachedLottie,
  S3_APP_ICON_LOTTIE_URL,
  S3_APP_BANNER_LOTTIE_URL,
} from '../infrastructure/media/lottie';
import AnimatedSplashScreen from '../shell/components/AnimatedSplashScreen';
import NotificationBanner from '../shell/components/NotificationBanner';
import LockOverlay from '../shell/components/LockOverlay';
import { ThemedAlertHost } from '../design-system/components/ThemedAlert';
import { locationService } from '../features/users/api/location.api';
import { initGameSound } from '../features/games/media/game-sound';

SplashScreen.preventAutoHideAsync();

// Warm up game audio + haptics prefs so the first match has zero startup latency
initGameSound();

// Captures the user's last location whenever the app comes to the foreground,
// but only if they already granted location permission (no prompt, throttled).
function LocationTracker() {
  const { isLoggedIn } = useAuth();

  useEffect(() => {
    if (isLoggedIn) locationService.captureIfPermitted();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && isLoggedIn) locationService.captureIfPermitted();
    });
    return () => sub.remove();
  }, [isLoggedIn]);

  return null;
}

// Inside the provider tree: theme, auth gating, the root Stack, and the global
// overlays (banner, lock, alerts, splash) that sit above navigation.
function AppShell() {
  const { colors, isDark } = useTheme();
  const { isLoading, isLoggedIn, isSplashVisible, setLottieFinished, needsForceUpdate } =
    useAuth();
  const [lottieReady, setLottieReady] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // Prefetch the Lotties in the background so they're ready for pull-to-refresh & headers!
    getCachedLottie(S3_APP_ICON_LOTTIE_URL).catch(() => {});
    getCachedLottie(S3_APP_BANNER_LOTTIE_URL).catch(() => {});
  }, []);

  // Hide the native splash only after the Lottie splash has mounted and
  // painted its first frame — prevents a blank flash between the native
  // splash disappearing and the Lottie becoming visible.
  useEffect(() => {
    if (lottieReady) {
      setTimeout(() => {
        SplashScreen.hideAsync();
      }, 250);
    }
  }, [lottieReady]);

  // When isLoggedIn flips to false (logout or forced logout), navigate to
  // auth from anywhere in the stack — pushed screens like /settings or /chat
  // won't redirect on their own since they're outside (main)/_layout.
  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.replace('/(auth)');
    }
  }, [isLoggedIn, isLoading]);

  // Hard-gate: when the backend mandates an update, only the force-update
  // screen is reachable.
  if (needsForceUpdate && pathname !== '/force-update') {
    return <Redirect href={"/force-update" as never} />;
  }

  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: colors.bg.base }}
    >
      <RNStatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.bg.base}
      />
      <LocationTracker />
      <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(main)" />
        <Stack.Screen name="terms" />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="force-update" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="search" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="wallet" />
        <Stack.Screen name="bookmarks" />
        <Stack.Screen name="leaderboards" />
        <Stack.Screen name="follow-requests" />
        <Stack.Screen name="post/[id]" />
        <Stack.Screen name="user/[username]" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="comments/[postId]" />
        <Stack.Screen name="story/[id]" />
        <Stack.Screen
          name="lock"
          options={{ presentation: 'fullScreenModal', animation: 'fade' }}
        />
      </Stack>
      <NotificationBanner />
      <LockOverlay />
      <ThemedAlertHost />
      {isSplashVisible && (
        <AnimatedSplashScreen
          onAnimationFinish={() => setLottieFinished(true)}
          onReady={() => setLottieReady(true)}
          isAuthLoading={isLoading}
        />
      )}
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ScrollProvider>
        <AudioProvider>
          <LoaderProvider>
            <Providers>
              <AppUpdaterHost />
              <AppShell />
            </Providers>
          </LoaderProvider>
        </AudioProvider>
      </ScrollProvider>
    </SafeAreaProvider>
  );
}