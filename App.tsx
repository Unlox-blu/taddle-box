import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar as RNStatusBar } from 'react-native';
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
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/lib/react-query';
import AppLockOverlay       from './src/components/common/AppLockOverlay';

SplashScreen.preventAutoHideAsync();

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
        <AppNavigator />
        <AppLockOverlay />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <WalletProvider>
            <GamesProvider>
              <CommunityProvider>
                <PostsProvider>
                  <AppShell />
                </PostsProvider>
              </CommunityProvider>
            </GamesProvider>
          </WalletProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
