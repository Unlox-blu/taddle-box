import React from 'react';
import { View } from 'react-native';
import { createNavigationContainerRef, NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import ForceUpdateScreen from '../screens/main/ForceUpdateScreen';
// PostDetailScreen and UserProfileScreen are eagerly imported because PostCard
// navigates to them frequently and they're registered in HomeStackNavigator too.
// Lazy-loading caused Metro module resolution failures (module 2063).
import ReelScreen from '../screens/main/ReelScreen';
import UserProfileScreen from '../screens/main/UserProfileScreen';
const SearchScreen = React.lazy(() => import('../screens/main/SearchScreen'));
const EventDetailScreen = React.lazy(() => import('../screens/events/EventDetailScreen'));
import UpdateAvailableModal from '../components/common/UpdateAvailableModal';
import { BrandedStaticLoader } from '../components/common/BrandedLoader';

const Stack = createNativeStackNavigator<RootStackParamList>();

// App-wide navigation ref so non-component code (notification banners, deep
// links, push response handlers) can navigate without being inside the tree.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Shared branded fallback for lazy-loaded screens — static image avoids
// blocking the main thread during navigation transitions.
const BrandedFallback = () => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#121216' }}>
    <BrandedStaticLoader size={64} />
  </View>
);

// Module-level wrappers so component identity is stable across renders.
const SuspenseSearch = (props: any) => (
  <React.Suspense fallback={<BrandedFallback />}>
    <SearchScreen {...props} />
  </React.Suspense>
);
const SuspenseEventDetail = (props: any) => (
  <React.Suspense fallback={<BrandedFallback />}>
    <EventDetailScreen {...props} />
  </React.Suspense>
);

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
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'none' }}>
        {needsForceUpdate ? (
          <Stack.Screen name="ForceUpdate" component={ForceUpdateScreen} />
        ) : isLoggedIn ? (
          <>
            <Stack.Screen name="Main" component={MainNavigator} />
            <Stack.Group>
            <Stack.Screen
              name="PostDetail"
              component={ReelScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="UserProfile"
              component={UserProfileScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="Search"
              component={SuspenseSearch}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="EventDetail"
              component={SuspenseEventDetail}
              options={{ animation: 'slide_from_right' }}
            />
            </Stack.Group>
          </>
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
      </Stack.Navigator>
      <UpdateAvailableModal />
    </NavigationContainer>
  );
}
