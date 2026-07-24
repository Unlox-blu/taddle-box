import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { DARK_COLORS, LIGHT_COLORS, type ColorPalette } from '../theme';

export type ThemePreference = 'system' | 'light' | 'dark';

type ThemeContextType = {
  isDark:             boolean;
  colors:             ColorPalette;
  themePreference:    ThemePreference;
  setThemePreference: (pref: ThemePreference) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextType>({
  isDark:             true,
  colors:             DARK_COLORS,
  themePreference:    'system',
  setThemePreference: async () => {},
});

const THEME_KEY = 'app_themePreference';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme(); // 'dark' | 'light' | null
  const [themePreference, setPreference] = useState<ThemePreference>('system');

  useEffect(() => {
    // Load saved preference on mount
    SecureStore.getItemAsync(THEME_KEY).then(saved => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setPreference(saved);
      }
    });
  }, []);

  const isDark =
    themePreference === 'system'
      ? systemScheme === 'dark'
      : themePreference === 'dark';

  const setThemePreference = async (pref: ThemePreference) => {
    await SecureStore.setItemAsync(THEME_KEY, pref);
    setPreference(pref);
  };

  return (
    <ThemeContext.Provider
      value={{
        isDark,
        colors: isDark ? DARK_COLORS : LIGHT_COLORS,
        themePreference,
        setThemePreference,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme       = () => useContext(ThemeContext);
export const useThemeColors = () => useContext(ThemeContext).colors;
