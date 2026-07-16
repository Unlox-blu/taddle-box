import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { authService } from '../services/auth.service';
import { socketClient } from '../services/socketClient';

type AuthContextType = {
  isLoggedIn: boolean;
  isLoading: boolean;
  user: any;
  signIn: (token: string, refreshToken?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  isLoggedIn: false,
  isLoading: true,
  user: undefined,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(undefined);

  useEffect(() => {
    checkToken();
  }, []);

  const checkToken = async () => {
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      if (token) {
        // Fetch real user data from backend
        const res = await authService.getMe();
        setUser(res.data.user);
        setIsLoggedIn(true);
        await socketClient.connect();
      } else {
        setIsLoggedIn(false);
      }
    } catch (e) {
      console.error('Error checking token, user might be invalid or offline', e);
      // If the token is invalid or backend is down, log them out locally to prevent crashes
      await SecureStore.deleteItemAsync('accessToken');
      await SecureStore.deleteItemAsync('refreshToken');
      setIsLoggedIn(false);
      setUser(undefined);
    } finally {
      setIsLoading(false);
    }
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
    <AuthContext.Provider value={{ isLoggedIn, isLoading, user, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
