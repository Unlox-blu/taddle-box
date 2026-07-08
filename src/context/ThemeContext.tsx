import React, { createContext, useContext, useState } from 'react';
import { DARK_COLORS, LIGHT_COLORS, type ColorPalette } from '../theme';

type ThemeContextType = {
  isDark:      boolean;
  colors:      ColorPalette;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType>({
  isDark:      true,
  colors:      DARK_COLORS,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true);
  return (
    <ThemeContext.Provider
      value={{
        isDark,
        colors:      isDark ? DARK_COLORS : LIGHT_COLORS,
        toggleTheme: () => setIsDark(v => !v),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme       = () => useContext(ThemeContext);
export const useThemeColors = () => useContext(ThemeContext).colors;
