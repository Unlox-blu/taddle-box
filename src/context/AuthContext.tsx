import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { authService } from '../services/auth.service';
import { socketClient } from '../services/socketClient';

type AuthContextType = {
  isLoggedIn:  boolean;
  isLoading:   boolean;
  user:        any;
  signIn:      (token: string, refreshToken?: string) => Promise<void>;
  signOut:     () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser:  (partial: Partial<any>) => void;
  needsForceUpdate: boolean;
  storeUrl:    string | null;
};

const AuthContext = createContext<AuthContextType>({
  isLoggedIn:  false,
  isLoading:   true,
  user:        undefined,
  signIn:      async () => {},
  signOut:     async () => {},
  refreshUser: async () => {},
  updateUser:  () => {},
  needsForceUpdate: false,
  storeUrl:    null,
});

import { appConfigService } from '../services/appConfig.service';
const APP_VERSION = '1.0.0'; // Hardcoded for now, could use expo-application

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(undefined);
  const [needsForceUpdate, setNeedsForceUpdate] = useState(false);
  const [storeUrl, setStoreUrl] = useState<string | null>(null);

  useEffect(() => {
    checkToken();

    // Listen for XP updates from the backend
    const handleXPUpdate = (data: { xp: number }) => {
      setUser((prev: any) => prev ? { ...prev, xp: data.xp } : prev);
    };

    socketClient.socket?.on('xp:updated', handleXPUpdate);

    return () => {
      socketClient.socket?.off('xp:updated', handleXPUpdate);
    };
  }, []);

  const checkToken = async () => {
    try {
      // First check for forced updates
      try {
        const configRes = await appConfigService.getAppConfig();
        const config = configRes.data;
        if (config && config.minimumVersion && config.minimumVersion > APP_VERSION) {
          setNeedsForceUpdate(true);
          setStoreUrl(config.storeUrl || 'https://play.google.com/store');
        }
      } catch (err) {
        console.warn('Failed to fetch app config', err);
      }

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
      try {
        const configRes = await appConfigService.getAppConfig();
        const config = configRes.data;
        if (config && config.minimumVersion && config.minimumVersion > APP_VERSION) {
          setNeedsForceUpdate(true);
          setStoreUrl(config.storeUrl || 'https://play.google.com/store');
        }
      } catch (err) {
        console.warn('Failed to fetch app config on login', err);
      }

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
        user,
        signIn,
        signOut,
        refreshUser,
        updateUser,
        needsForceUpdate,
        storeUrl,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
