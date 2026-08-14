import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { authService } from '../services/auth.service';
import { socketClient } from '../services/socketClient';

type AuthContextType = {
  isLoggedIn:  boolean;
  isLoading:   boolean;
  isAuthenticating: boolean;
  setIsAuthenticating: (val: boolean) => void;
  isSplashVisible: boolean;
  setLottieFinished: (val: boolean) => void;
  user:        any;
  signIn:      (token: string, refreshToken?: string) => Promise<void>;
  signOut:     () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser:  (partial: Partial<any>) => void;
  needsForceUpdate: boolean;
  /** A newer version exists but this one is still usable — soft update popup. */
  updateAvailable: boolean;
  dismissUpdate: () => void;
  storeUrl:    string | null;
  hasSeenOnboarding: boolean;
  setHasSeenOnboarding: (val: boolean) => void;
};

const AuthContext = createContext<AuthContextType>({
  isLoggedIn:  false,
  isLoading:   true,
  isAuthenticating: false,
  setIsAuthenticating: () => {},
  isSplashVisible: true,
  setLottieFinished: () => {},
  user:        undefined,
  signIn:      async () => {},
  signOut:     async () => {},
  refreshUser: async () => {},
  updateUser:  () => {},
  needsForceUpdate: false,
  updateAvailable: false,
  dismissUpdate: () => {},
  storeUrl:    null,
  hasSeenOnboarding: false,
  setHasSeenOnboarding: () => {},
});

import { appConfigService } from '../services/appConfig.service';

// Real installed version comes from the Expo build config (app.json version).
const getAppVersion = (): string =>
  Constants.expoConfig?.version || '1.0.0';

// Numeric semver-ish compare: '1.10.0' > '1.9.2'. Returns 1 / -1 / 0.
const compareVersions = (a: string, b: string): number => {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [lottieFinished, setLottieFinished] = useState(false);
  const [user, setUser] = useState<any>(undefined);
  const [needsForceUpdate, setNeedsForceUpdate] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

  // The global splash screen is visible until BOTH the auth check completes AND the Lottie finishes its first loop,
  // OR when a manual login process is actively authenticating.
  const isSplashVisible = isLoading || !lottieFinished || isAuthenticating;

  // We need to reset lottieFinished when we start authenticating again so it plays a full loop
  useEffect(() => {
    if (isAuthenticating) {
      setLottieFinished(false);
    }
  }, [isAuthenticating]);

  // Compare installed version against app_config: below minimum → force
  // update (app is unusable); below latest → soft update popup.
  const checkAppConfig = useCallback(async () => {
    try {
      const configRes = await appConfigService.getAppConfig();
      const config = configRes.data;
      const current = getAppVersion();
      if (!config || (!config.minimumVersion && !config.latestVersion)) return;
      if (config.minimumVersion && compareVersions(current, config.minimumVersion) < 0) {
        setNeedsForceUpdate(true);
        setStoreUrl(config.storeUrl || 'https://play.google.com/store');
      } else if (config.latestVersion && compareVersions(current, config.latestVersion) < 0) {
        setUpdateAvailable(true);
        setStoreUrl(config.storeUrl || 'https://play.google.com/store');
      }
    } catch (err) {
      console.warn('Failed to fetch app config', err);
    }
  }, []);

  useEffect(() => {
    checkToken();

    // Listen for XP updates from the backend
    const handleXPUpdate = (data: { xp: number }) => {
      setUser((prev: any) => prev ? { ...prev, xp: data.xp } : prev);
    };

    socketClient.events.on('xp:updated', handleXPUpdate);

    return () => {
      socketClient.events.off('xp:updated', handleXPUpdate);
    };
  }, []);

  const checkToken = async () => {
    try {
      // First check for updates
      await checkAppConfig();
      
      const seen = await SecureStore.getItemAsync('hasSeenOnboarding');
      setHasSeenOnboarding(!!seen);

      const token = await SecureStore.getItemAsync('accessToken');
      if (token) {
        const res = await authService.getMe();
        setUser(res.data.user);
        setIsLoggedIn(true);
        await socketClient.connect();
      } else {
        setIsLoggedIn(false);
      }
    } catch (e) {
      console.error('Error checking token, user might be invalid or offline', e);
      await SecureStore.deleteItemAsync('accessToken');
      await SecureStore.deleteItemAsync('refreshToken');
      setIsLoggedIn(false);
      setUser(undefined);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshUser = async () => {
    try {
      const res = await authService.getMe();
      setUser(res.data.user);
    } catch (e) {
      console.error('Error refreshing user', e);
    }
  };

  const updateUser = (partial: Partial<any>) => {
    setUser((prev: any) => prev ? { ...prev, ...partial } : prev);
  };

  const signIn = async (token: string, refreshToken?: string) => {
    await SecureStore.deleteItemAsync('accessToken');
    if (token) {
      await SecureStore.setItemAsync('accessToken', token);
    }
    
    await SecureStore.deleteItemAsync('refreshToken');
    if (refreshToken) {
      await SecureStore.setItemAsync('refreshToken', refreshToken);
    }
    // Fetch user after signing in
    try {
      // Also check app config on fresh login
      await checkAppConfig();

      const res = await authService.getMe();
      setUser(res.data.user);
      setIsLoggedIn(true);
      await socketClient.connect();
    } catch (e) {
      console.error('Error fetching user after sign in', e);
      // Clean up the invalid tokens we just saved
      await SecureStore.deleteItemAsync('accessToken');
      await SecureStore.deleteItemAsync('refreshToken');
      throw e; // Throw so LoginScreen can show an alert instead of silently failing
    }
  };

  const dismissUpdate = () => setUpdateAvailable(false);

  const signOut = async () => {
    try {
      if (isLoggedIn) {
        await authService.logout();
      }
    } catch (e) {
      console.warn('Backend logout failed, continuing local logout');
    }
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    socketClient.disconnect();
    setIsLoggedIn(false);
    setUser(undefined);
  };

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn,
        isLoading,
        isAuthenticating,
        setIsAuthenticating,
        isSplashVisible,
        setLottieFinished,
        user,
        signIn,
        signOut,
        refreshUser,
        updateUser,
        needsForceUpdate,
        updateAvailable,
        dismissUpdate,
        storeUrl,
        hasSeenOnboarding,
        setHasSeenOnboarding,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
