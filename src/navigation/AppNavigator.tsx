import React from 'react';
import { createNavigationContainerRef, NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import ForceUpdateScreen from '../screens/main/ForceUpdateScreen';
import PostDetailScreen from '../screens/main/PostDetailScreen';
import UserProfileScreen from '../screens/main/UserProfileScreen';
import SearchScreen from '../screens/main/SearchScreen';
import EventDetailScreen from '../screens/events/EventDetailScreen';
import UpdateAvailableModal from '../components/common/UpdateAvailableModal';

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
          <>
            <Stack.Screen name="Main" component={MainNavigator} />
            {/* Post page lives ABOVE the tabs (root stack) so it opens full-screen
                from any tab — feed, community, profile, notifications, tray taps.
                Registering it only in the Home stack made taps from other tabs
                bubble up unhandled (nothing happened). */}
            <Stack.Screen
              name="PostDetail"
              component={PostDetailScreen}
              options={{ animation: 'slide_from_right' }}
            />
            {/* Profiles reachable from the full-screen post page (author/mention
                taps). Registered at root so those taps work; the Home-stack copy
                still handles profile navigation inside the tab. */}
            <Stack.Screen
              name="UserProfile"
              component={UserProfileScreen}
              options={{ animation: 'slide_from_right' }}
            />
            {/* Hashtag taps inside the full-screen post page / pushed profiles
                land here (the Home-stack copy serves the in-tab search). */}
            <Stack.Screen
              name="Search"
              component={SearchScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="EventDetail"
              component={EventDetailScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
          </>
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
      </Stack.Navigator>
      {/* Soft update popup sits above everything; force updates block on the screen above. */}
      <UpdateAvailableModal />
    </NavigationContainer>
  );
}
