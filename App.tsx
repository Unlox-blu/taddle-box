import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import {
  StatusBar as RNStatusBar,
  AppState,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import AppNavigator         from './src/navigation/AppNavigator';
import { AuthProvider }     from './src/context/AuthContext';
import { PostsProvider }    from './src/context/PostsContext';
import { CommunityProvider }from './src/context/CommunityContext';
import { WalletProvider }   from './src/context/WalletContext';
import { GamesProvider }    from './src/context/GamesContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/lib/react-query';
import AppLockOverlay       from './src/components/common/AppLockOverlay';
import NotificationBanner   from './src/components/common/NotificationBanner';
import { ThemedAlertHost }  from './src/components/common/ThemedAlert';
import { PresenceProvider } from './src/context/PresenceContext';
import { useAuth } from './src/context/AuthContext';
import { locationService } from './src/services/location.service';
import { initGameSound }     from './src/services/gameSound';
import AppErrorBoundary from './src/components/common/AppErrorBoundary';

SplashScreen.preventAutoHideAsync();

// Warm up game audio + haptics prefs so the first match has zero startup latency
initGameSound();

// Inner shell reads theme so background + status bar react to light/dark toggle
function AppShell() {
  const { colors, isDark } = useTheme();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg.base }}>
      <SafeAreaProvider>
        <RNStatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={colors.bg.base}
        />
        <LocationTracker />
        <AppNavigator />
        <NotificationBanner />
        <AppLockOverlay />
        <ThemedAlertHost />
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
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && isLoggedIn) locationService.captureIfPermitted();
    });
    return () => sub.remove();
  }, [isLoggedIn]);

  return null;
}

export default function App() {
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
