import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import NetInfo from '@react-native-community/netinfo';
import { authService } from '../services/auth.service';
import { apiClient } from '../services/apiClient';
import { socketClient } from '../services/socketClient';
import { ensureGameLogos } from '../games/gameAssets';
import { getAccounts, addAccount as storeAddAccount, removeAccount as storeRemoveAccount, storeCurrentAccountTokens, restoreAccountTokens, clearAllAccounts, type AccountProfile } from '../utils/accountStore';
import type { XPUpdatedPayload } from '../types';
import { queryClient } from '../lib/react-query';

type AuthContextType = {
  isLoggedIn:  boolean;
  isLoading:   boolean;
  isAuthenticating: boolean;
  setIsAuthenticating: (val: boolean) => void;
  isSplashVisible: boolean;
  setLottieFinished: (val: boolean) => void;
  user:        any;
  signIn:      (token: string, refreshToken?: string, sessionId?: string) => Promise<void>;
  signOut:     (opts?: { allDevices?: boolean }) => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser:  (partial: Partial<any>) => void;
  /** All accounts stored on this device. */
  accounts:    AccountProfile[];
  /** Switch to another logged-in account on this device. */
  switchAccount: (userId: number | string) => Promise<void>;
  /** Remove an account from this device (does NOT log out server-side). */
  removeAccountFromDevice: (userId: number | string) => Promise<void>;
  needsForceUpdate: boolean;
  /** A newer version exists but this one is still usable — soft update popup. */
  updateAvailable: boolean;
  dismissUpdate: () => void;
  storeUrl:    string | null;
  hasSeenOnboarding: boolean;
  setHasSeenOnboarding: (val: boolean) => void;
  /** Park current account tokens and go to the auth screen to add a new account. */
  goToAddAccount: () => Promise<void>;
  /** Username of an account whose session expired during switch — LoginScreen pre-fills it. */
  expiredAccountUsername: string | null;
  /** Clear the expired-account hint after the user has seen it. */
  clearExpiredAccount: () => void;
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
  accounts:    [],
  switchAccount: async () => {},
  removeAccountFromDevice: async () => {},
  needsForceUpdate: false,
  updateAvailable: false,
  dismissUpdate: () => {},
  storeUrl:    null,
  hasSeenOnboarding: false,
  setHasSeenOnboarding: () => {},
  goToAddAccount: async () => {},
  expiredAccountUsername: null,
  clearExpiredAccount: () => {},
});

import { AppState, AppStateStatus } from 'react-native';
import { appConfigService } from '../services/appConfig.service';
import { setForcedLogoutHandler, clearForcedLogoutHandler } from '../services/apiClient';
import { deviceSocketClient } from '../services/deviceSocketClient';
import { destroyGameSound } from '../services/gameSound';
import { validateStoredAccounts } from '../services/sessionValidator';

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
  const [accounts, setAccounts] = useState<AccountProfile[]>([]);
  const [needsForceUpdate, setNeedsForceUpdate] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const [expiredAccountUsername, setExpiredAccountUsername] = useState<string | null>(null);

  const clearExpiredAccount = useCallback(() => setExpiredAccountUsername(null), []);

  /** Refresh the accounts list from SecureStore. */
  const refreshAccounts = useCallback(async () => {
    const list = await getAccounts();
    setAccounts(list);
  }, []);

  // ── Forced logout handler ──────────────────────────────────────────────
  // When another device calls "Log out from all devices", the refresh-token
  // call on this device fails with 401. The apiClient interceptor invokes
  // this handler so we can clean up the account and redirect to login.
  const handleForcedLogout = useCallback(async () => {
    try {
      const activeUserId = await SecureStore.getItemAsync('activeUserId');
      const parsedId = activeUserId ? JSON.parse(activeUserId) : null;

      // Remove this account from the stored list so it doesn't show in the switcher
      if (parsedId != null) {
        await storeRemoveAccount(parsedId);
      }

      // Clear all auth tokens
      await SecureStore.deleteItemAsync('accessToken');
      await SecureStore.deleteItemAsync('refreshToken');
      await SecureStore.deleteItemAsync('sessionId');
      await SecureStore.deleteItemAsync('activeUserId');

      // Disconnect socket
      socketClient.disconnect();

      // Update React state — user will see auth screens
      setIsLoggedIn(false);
      setUser(undefined);
      await refreshAccounts();
    } catch (e) {
      console.error('Forced logout cleanup failed', e);
      // Last-resort: clear everything and hope for the best
      setIsLoggedIn(false);
      setUser(undefined);
    }
  }, [refreshAccounts]);

  // Register the forced-logout handler with the API interceptor on mount,
  // clean up on unmount.
  useEffect(() => {
    setForcedLogoutHandler(handleForcedLogout);
    return () => clearForcedLogoutHandler();
  }, [handleForcedLogout]);

  // ── Device-level WebSocket ──────────────────────────────────────────────
  // Connects once on mount (regardless of which account is active).
  // Receives auth:session_revoked events when another device calls
  // "Log out from all devices" — instantly cleans up the affected account.
  useEffect(() => {
    deviceSocketClient.connect();

    const handleSessionRevoked = async (data: { userId: number | string }) => {
      console.log('[Auth] Session revoked via device socket for userId:', data.userId);
      // Remove the revoked account from the store
      await storeRemoveAccount(data.userId);
      await refreshAccounts();
      // If the revoked account is the currently active one, force logout
      if (user?.id && String(user.id) === String(data.userId)) {
        await handleForcedLogout();
      }
    };

    deviceSocketClient.events.on('auth:session_revoked', handleSessionRevoked);

    return () => {
      deviceSocketClient.events.off('auth:session_revoked', handleSessionRevoked);
      deviceSocketClient.disconnect();
    };
  }, [handleForcedLogout, refreshAccounts, user?.id]);

  // The global splash screen is visible until BOTH the auth check completes AND the Lottie finishes its first loop,
  // OR when a manual login process is actively authenticating.
  const isSplashVisible = isLoading || !lottieFinished || isAuthenticating;

  // Reset lottieFinished when starting a fresh login (not account switch) so it
  // plays a full loop. Account switches skip the lottie — the splash dismisses
  // as soon as isAuthenticating flips back to false.
  useEffect(() => {
    if (isAuthenticating) {
      // If already logged in (account switch), skip lottie reset — splash
      // will dismiss immediately when isAuthenticating becomes false.
      if (!isLoggedIn) {
        setLottieFinished(false);
      }
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

    // Listen for XP updates from the backend — mirrors the authoritative
    // balance into user.xp (the wallet NEVER reads user.xp as state; this is
    // just a convenience mirror for components that read the auth user).
    const handleXPUpdate = (data: XPUpdatedPayload) => {
      setUser((prev: any) => prev ? { ...prev, xp: data.xp } : prev);
    };

    socketClient.events.on('xp:updated', handleXPUpdate);

    return () => {
      socketClient.events.off('xp:updated', handleXPUpdate);
    };
  }, []);

  // ── Session validation on foreground / cold start ─────────────────────
  // When the app comes back to foreground or starts fresh, validate ALL
  // stored accounts in one batch call. Revoked sessions are silently
  // removed. If the active account is revoked, trigger forced logout.
  useEffect(() => {
    let previousState: AppStateStatus = AppState.currentState;

    const handleAppStateChange = async (nextState: AppStateStatus) => {
      // Only run when transitioning TO active from background/inactive
      if (previousState.match(/background|inactive/) && nextState === 'active') {
        console.log('[Auth] App foregrounded — validating stored sessions');
        const result = await validateStoredAccounts();
        await refreshAccounts();
        if (result.activeAccountRevoked) {
          await handleForcedLogout();
        }
      }
      previousState = nextState;
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [handleForcedLogout, refreshAccounts]);

  // Cold-start validation: runs once after initial checkToken completes.
  // Delayed 3s so it doesn't compete with splash/auth traffic.
  useEffect(() => {
    if (isLoading) return; // Wait for checkToken to finish
    let cancelled = false;
    const t = setTimeout(async () => {
      if (cancelled) return;
      console.log('[Auth] Cold-start session validation');
      const result = await validateStoredAccounts();
      if (cancelled) return;
      await refreshAccounts();
      if (result.activeAccountRevoked && isLoggedIn) {
        await handleForcedLogout();
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [isLoading]); // Only re-run when isLoading changes (cold start)

  // Prewarm the game logos shortly after login so the Games tab feels
  // instant — but ONLY on an unmetered connection and only after startup
  // traffic has settled (idle network). Best-effort by design: the Games tab
  // warms logos on entry too, so a skipped prewarm is never a failure.
  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const state = await NetInfo.fetch();
        if (cancelled) return;
        if (!state.isConnected || state.isInternetReachable === false) return;
        // Skip metered links (cellular) — the tab-entry warm covers them.
        if (state.type !== 'wifi' && state.type !== 'ethernet') return;
        await ensureGameLogos();
      } catch {
        /* prewarm is best-effort */
      }
    }, 12000); // let auth + feed traffic settle first
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [isLoggedIn]);

  const checkToken = async () => {
    try {
      // First check for updates
      await checkAppConfig();
      
      const seen = await SecureStore.getItemAsync('hasSeenOnboarding');
      setHasSeenOnboarding(!!seen);

      // Load stored accounts list
      await refreshAccounts();

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

  const signIn = async (token: string, refreshToken?: string, sessionId?: string) => {
    // Clear any expired-account hint — successful login means we're past it.
    setExpiredAccountUsername(null);
    // If switching accounts, save current account's tokens first
    if (user?.id) {
      await storeCurrentAccountTokens(user.id);
    }

    await SecureStore.deleteItemAsync('accessToken');
    if (token) {
      await SecureStore.setItemAsync('accessToken', token);
    }
    
    await SecureStore.deleteItemAsync('refreshToken');
    if (refreshToken) {
      await SecureStore.setItemAsync('refreshToken', refreshToken);
    }

    await SecureStore.deleteItemAsync('sessionId');
    if (sessionId) {
      await SecureStore.setItemAsync('sessionId', sessionId);
    }
    // Fetch user after signing in
    try {
      // Also check app config on fresh login
      await checkAppConfig();

      const res = await authService.getMe();
      const newUser = res.data.user;
      setUser(newUser);

      // Persist this account in the accounts list
      if (newUser) {
        await storeAddAccount({
          userId: newUser.id,
          name: newUser.name || 'User',
          username: newUser.username || 'user',
          avatarUrl: newUser.avatarUrl,
        });
        await refreshAccounts();
      }

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

  const signOut = async (opts?: { allDevices?: boolean }) => {
    const userId = user?.id;
    try {
      if (isLoggedIn) {
        if (opts?.allDevices) {
          // Revoke ALL sessions across all devices (no sessionId = full logout)
          await apiClient.post('/auth/logout', {});
        } else {
          // Revoke only this device's session
          const sessionId = await SecureStore.getItemAsync('sessionId');
          if (sessionId) {
            await apiClient.post('/auth/logout', { sessionId });
          } else {
            await authService.logout();
          }
        }
      }
    } catch (e) {
      console.warn('Backend logout failed, continuing local logout');
    }
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    await SecureStore.deleteItemAsync('sessionId');
    // Remove this account from the stored list
    if (userId) {
      await storeRemoveAccount(userId);
    }
    socketClient.disconnect();
    // Release native audio players on logout
    destroyGameSound().catch(() => {});
    setIsLoggedIn(false);
    setUser(undefined);
    await refreshAccounts();
  };

  /** Switch to another logged-in account on this device. */
  const switchAccount = async (targetUserId: number | string) => {
    setIsAuthenticating(true); // Show splash screen during switch

    // 1. Save current account tokens and disconnect if currently logged in
    if (isLoggedIn && user?.id) {
      await storeCurrentAccountTokens(user.id);
      socketClient.disconnect();
    }

    // Force unmount the MainNavigator so all screens remount fresh
    setIsLoggedIn(false);
    setUser(undefined);
    
    // 2. Restore target account tokens
    await restoreAccountTokens(targetUserId);
    // 3. Mark as active
    await SecureStore.setItemAsync('activeUserId', JSON.stringify(targetUserId));
    
    // Clear all previous user data from React Query cache
    queryClient.clear();

    // 4. Re-fetch user profile and reconnect
    try {
      const res = await authService.getMe();
      setUser(res.data.user);
      setIsLoggedIn(true);
      await socketClient.connect();
    } catch (e) {
      console.error('Failed to switch account', e);
      // Instagram-style: keep the account in the list, don't auto-remove.
      // Instead, pass the username to LoginScreen so it can pre-fill it.
      const targetProfile = accounts.find((a) => String(a.userId) === String(targetUserId));
      setExpiredAccountUsername(targetProfile?.username || null);
      // User is already logged out (setIsLoggedIn(false) above) — auth screens will show.
    } finally {
      setIsAuthenticating(false);
    }
  };

  /** Remove an account from this device's stored list. */
  const removeAccountFromDevice = async (targetUserId: number | string) => {
    await storeRemoveAccount(targetUserId);
    await refreshAccounts();
    // If removed the active account, sign out
    if (user?.id && String(user.id) === String(targetUserId)) {
      await signOut();
    }
  };

  /** Park current account tokens and go to the auth screen to add a new account. */
  const goToAddAccount = async () => {
    if (user?.id) {
      await storeCurrentAccountTokens(user.id);
      socketClient.disconnect();
    }
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    await SecureStore.deleteItemAsync('sessionId');
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
        accounts,
        switchAccount,
        removeAccountFromDevice,
        needsForceUpdate,
        updateAvailable,
        dismissUpdate,
        storeUrl,
        hasSeenOnboarding,
        setHasSeenOnboarding,
        goToAddAccount,
        expiredAccountUsername,
        clearExpiredAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
