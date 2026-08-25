import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';

import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import NetInfo from '@react-native-community/netinfo';
import { authService } from '../services/auth.service';
import { apiClient } from '../services/apiClient';
import { accountSocket } from '../services/accountSocketClient';

import { getAccounts, addAccount as storeAddAccount, removeAccount as storeRemoveAccount, storeCurrentAccountTokens, restoreAccountTokens, clearAccountTokens, clearAllAccounts, type AccountProfile } from '../utils/accountStore';
import type { XPUpdatedPayload } from '../types';
import { queryClient } from '../lib/react-query';
import { themedAlert } from '../components/common/ThemedAlert';

type AuthContextType = {
  isLoggedIn:  boolean;
  isLoading:   boolean;
  isAuthenticating: boolean;
  setIsAuthenticating: (val: boolean) => void;
  isSplashVisible: boolean;
  setLottieFinished: (val: boolean) => void;
  user:        any;
  signIn:      (token: string, refreshToken?: string, sessionId?: string, tokenExpiresAt?: number) => Promise<void>;
  signOut:     (opts?: { allDevices?: boolean, keepAccount?: boolean }) => Promise<void>;
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
import { setForcedLogoutHandler, clearForcedLogoutHandler, doRefreshToken } from '../services/apiClient';
import { log, warn, error } from '../utils/logger';
import { deviceSocketClient } from '../services/deviceSocketClient';
import { destroyGameSound } from '../services/gameSound';
import { clearSessionAvatars } from '../services/sessionAvatarCache';
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

  // ── Proactive token refresh ──────────────────────────────────────────────
  // Instead of waiting for a 401 to trigger a refresh (which causes visible
  // request failures and the old app-remount bug), we proactively refresh the
  // access token before it expires. The backend returns a `tokenExpiresAt`
  // timestamp alongside the access token — we store it in SecureStore and
  // schedule a timer that fires 5 minutes before expiry.
  const proactiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRefreshingRef = useRef(false);

  const TOKEN_EXPIRY_KEY = 'tokenExpiresAt';
  // Refresh 5 minutes before expiry to avoid any edge-case 401s.
  const REFRESH_BUFFER_MS = 5 * 60 * 1000;

  /**
   * Schedule (or re-schedule) the proactive refresh timer.
   * Called after every successful login, account switch, and token refresh.
   */
  const scheduleProactiveRefresh = useCallback(async () => {
    // Clear any existing timer
    if (proactiveTimerRef.current) {
      clearTimeout(proactiveTimerRef.current);
      proactiveTimerRef.current = null;
    }

    try {
      const expiresAtRaw = await SecureStore.getItemAsync(TOKEN_EXPIRY_KEY);
      const expiresAt = expiresAtRaw ? Number(expiresAtRaw) : 0;
      if (!expiresAt) return; // No expiry stored — fall back to reactive refresh

      const now = Date.now();
      const msUntilRefresh = Math.max(0, expiresAt - REFRESH_BUFFER_MS - now);

      // Already past the refresh window — do it now
      if (msUntilRefresh <= 0) {
        log('[Auth] Token already past refresh window — refreshing now');
        if (!isRefreshingRef.current) {
          isRefreshingRef.current = true;
          try {
            await doRefreshToken();
            // Re-schedule for the new token
            scheduleProactiveRefresh();
          } catch (e) {
            warn('[Auth] Proactive refresh failed:', e);
          } finally {
            isRefreshingRef.current = false;
          }
        }
        return;
      }

      log(`[Auth] Proactive refresh scheduled in ${Math.round(msUntilRefresh / 1000)}s`);
      proactiveTimerRef.current = setTimeout(async () => {
        proactiveTimerRef.current = null;
        if (isRefreshingRef.current) return; // Already refreshing
        isRefreshingRef.current = true;
        try {
          const result = await doRefreshToken();
          if (result) {
            log('[Auth] Proactive refresh succeeded');
          } else {
            warn('[Auth] Proactive refresh returned no token');
          }
        } catch (e) {
          warn('[Auth] Proactive refresh failed:', e);
        } finally {
          isRefreshingRef.current = false;
          // Re-schedule for the next cycle (the interceptor will handle
          // any 401s in the meantime if we're still off).
          scheduleProactiveRefresh();
        }
      }, msUntilRefresh);
    } catch (e) {
      warn('[Auth] Failed to schedule proactive refresh:', e);
    }
  }, []);

  /**
   * Store the token expiry timestamp. The backend includes `tokenExpiresAt`
   * (epoch ms) in the login / refresh response. If the backend doesn't
   * include it, we log a warning and fall back to reactive-only refresh.
   */
  const persistTokenExpiry = useCallback(async (expiresAt?: number) => {
    if (!expiresAt) {
      warn('[Auth] Backend did not provide tokenExpiresAt — proactive refresh disabled for this token. The backend MUST include tokenExpiresAt in login and refresh responses.');
      return;
    }
    await SecureStore.setItemAsync(TOKEN_EXPIRY_KEY, String(expiresAt));
  }, []);

  /** Cancel the proactive timer (called on logout / account switch). */
  const cancelProactiveRefresh = useCallback(() => {
    if (proactiveTimerRef.current) {
      clearTimeout(proactiveTimerRef.current);
      proactiveTimerRef.current = null;
    }
    isRefreshingRef.current = false;
  }, []);

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
      accountSocket.disconnect();

      // Update React state — user will see auth screens
      setIsLoggedIn(false);
      setUser(undefined);
      await refreshAccounts();
      // Delay the alert to allow LockOverlay modal (if active) to unmount,
      // preventing the iOS quirk with overlapping system/app modals.
      setTimeout(() => {
        themedAlert(
          'Session Expired',
          'Your session has been logged out or expired. Please log in again.',
          [{ text: 'OK' }]
        );
      }, 500);
    } catch (e) {
      error('Forced logout cleanup failed', e);
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
  //
  // IMPORTANT: no user?.id in deps — this is a device-level socket that
  // must not disconnect/reconnect when the user object changes (e.g. after
  // checkToken loads the user). Use a ref to read the current user ID.
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;

  useEffect(() => {
    deviceSocketClient.connect();

    const handleSessionRevoked = async (data: { userId: number | string }) => {
      log('[Auth] Session revoked via device socket for userId:', data.userId);
      // Remove the revoked account from the store
      await storeRemoveAccount(data.userId);
      await refreshAccounts();
      // If the revoked account is the currently active one, force logout
      if (userIdRef.current && String(userIdRef.current) === String(data.userId)) {
        await handleForcedLogout();
      }
    };

    deviceSocketClient.events.on('auth:session_revoked', handleSessionRevoked);

    return () => {
      deviceSocketClient.events.off('auth:session_revoked', handleSessionRevoked);
      deviceSocketClient.disconnect();
    };
  }, [handleForcedLogout, refreshAccounts]);

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
      warn('Failed to fetch app config', err);
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

    accountSocket.events.on('xp:updated', handleXPUpdate);

    return () => {
      accountSocket.events.off('xp:updated', handleXPUpdate);
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
        log('[Auth] App foregrounded — validating stored sessions');
        // Re-schedule proactive refresh in case the timer expired while backgrounded
        if (isLoggedIn) {
          scheduleProactiveRefresh();
        }
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
      // Game assets download per-game on PLAY tap (ensureGameAssets(slug)).
      // No cold-start warm needed — logos download on Games tab focus.
      log('[Auth] Cold-start session validation');
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
        // Thumbnail pre-warming is now handled by preloadGameThumbnails
        // in GamesScreen on tab focus — no app-start download needed.
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
        await accountSocket.connect();
        // Schedule proactive refresh for the existing session
        scheduleProactiveRefresh();
      } else {
        setIsLoggedIn(false);
      }
    } catch (e) {
      error('Error checking token, user might be invalid or offline', e);
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
      error('Error refreshing user', e);
    }
  };

  const updateUser = (partial: Partial<any>) => {
    setUser((prev: any) => prev ? { ...prev, ...partial } : prev);
  };

  const signIn = async (token: string, refreshToken?: string, sessionId?: string, tokenExpiresAt?: number) => {
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
    // Persist token expiry for proactive refresh
    await persistTokenExpiry(tokenExpiresAt);
    // Fetch user after signing in
    try {
      // Also check app config on fresh login
      await checkAppConfig();

      const res = await authService.getMe();
      const newUser = res.data.user;
      setUser(newUser);

      // Persist this account in the accounts list
      if (newUser) {
        await SecureStore.setItemAsync('activeUserId', JSON.stringify(newUser.id));
        await storeCurrentAccountTokens(newUser.id);
        
        await storeAddAccount({
          userId: newUser.id,
          name: newUser.name || 'User',
          username: newUser.username || 'user',
          avatarUrl: newUser.avatarUrl,
        });
        await refreshAccounts();
      }

      setIsLoggedIn(true);
      await accountSocket.connect();
      // Start proactive refresh for the new session
      scheduleProactiveRefresh();
    } catch (e) {
      error('Error fetching user after sign in', e);
      // Clean up the invalid tokens we just saved
      await SecureStore.deleteItemAsync('accessToken');
      await SecureStore.deleteItemAsync('refreshToken');
      throw e; // Throw so LoginScreen can show an alert instead of silently failing
    }
  };

  const dismissUpdate = () => setUpdateAvailable(false);

  const signOut = async (opts?: { allDevices?: boolean, keepAccount?: boolean }) => {
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
      warn('Backend logout failed, continuing local logout');
    }
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    await SecureStore.deleteItemAsync('sessionId');
    // Remove this account from the stored list unless keepAccount is true
    if (userId && !opts?.keepAccount) {
      await storeRemoveAccount(userId);
    } else if (userId && opts?.keepAccount) {
      // Clear the saved tokens for this account so it can't be auto-restored
      await clearAccountTokens(userId);
    }
    accountSocket.disconnect();
    // Release native audio players on logout
    destroyGameSound().catch(() => {});
    clearSessionAvatars();
    cancelProactiveRefresh();
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
      accountSocket.disconnect();
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
      await accountSocket.connect();
      // Start proactive refresh for the switched account
      scheduleProactiveRefresh();
    } catch (e) {
      warn('Failed to login to saved account', e);
      const targetProfile = accounts.find((a) => String(a.userId) === String(targetUserId));
      setExpiredAccountUsername(targetProfile?.username || null);
      
      // Auto-remove the account from the saved list on failure
      await storeRemoveAccount(targetUserId);
      await refreshAccounts();
      // User is already logged out (setIsLoggedIn(false) above) — auth screens will show.
    } finally {
      setIsAuthenticating(false);
    }
  };

  /** Remove an account from this device's stored list. */
  const removeAccountFromDevice = async (targetUserId: number | string) => {
    // If we're removing an inactive account, we should still notify the backend 
    // to destroy that session if possible.
    const prefix = `user_${targetUserId}_`;
    const targetAccessToken = await SecureStore.getItemAsync(`${prefix}accessToken`);
    
    await storeRemoveAccount(targetUserId);
    await clearAccountTokens(targetUserId);
    await refreshAccounts();
    
    // If removed the active account, sign out locally + backend
    if (user?.id && String(user.id) === String(targetUserId)) {
      await signOut();
    } else if (targetAccessToken) {
      // Fire-and-forget background logout to the backend for this inactive account
      authService.logout(targetAccessToken).catch((e) => log("[Auth] Background logout for inactive account failed", e));
    }
  };

  /** Park current account tokens and go to the auth screen to add a new account. */
  const goToAddAccount = async () => {
    if (user?.id) {
      await storeCurrentAccountTokens(user.id);
      accountSocket.disconnect();
    }
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    await SecureStore.deleteItemAsync('sessionId');
    setIsLoggedIn(false);
    setUser(undefined);
  };

  const ctxValue = useMemo(() => ({
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
  }), [
    isLoggedIn, isLoading, isAuthenticating, isSplashVisible, user,
    accounts, needsForceUpdate, updateAvailable, storeUrl,
    hasSeenOnboarding, expiredAccountUsername,
    signIn, signOut, refreshUser, updateUser, switchAccount,
    removeAccountFromDevice, dismissUpdate, goToAddAccount, clearExpiredAccount,
  ]);

  return (
    <AuthContext.Provider value={ctxValue}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
