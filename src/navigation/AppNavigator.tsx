import React from 'react';
import { createNavigationContainerRef, NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import ForceUpdateScreen from '../screens/main/ForceUpdateScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

// App-wide navigation ref so non-component code (notification banners, deep
// links, push response handlers) can navigate without being inside the tree.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export default function AppNavigator() {
  const { isLoggedIn, needsForceUpdate } = useAuth();
  const { isDark, colors } = useTheme();

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    dark: isDark,
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      background:   colors.bg.base,
      card:         colors.bg.surface,
      text:         colors.text.primary,
      border:       colors.border,
      primary:      colors.primary,
      notification: colors.danger,
    },
  };

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {needsForceUpdate ? (
          <Stack.Screen name="ForceUpdate" component={ForceUpdateScreen} />
        ) : isLoggedIn ? (
          <Stack.Screen name="Main" component={MainNavigator} />
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
