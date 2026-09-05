import React from 'react';
import { View } from 'react-native';
import { createNavigationContainerRef, NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import * as Linking from 'expo-linking';

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
const CommunityDetailScreen = React.lazy(() => import('../screens/main/CommunityDetailScreen'));
const ChatInboxScreen = React.lazy(() => import('../screens/main/ChatInboxScreen'));
const ChatScreen = React.lazy(() => import('../screens/main/ChatScreen'));
const BookmarksScreen = React.lazy(() => import('../screens/main/BookmarksScreen'));
const SettingsScreen = React.lazy(() => import('../screens/main/SettingsScreen'));
const WalletScreen = React.lazy(() => import('../screens/main/WalletScreen'));
const LeaderboardsScreen = React.lazy(() => import('../screens/main/LeaderboardsScreen'));
const TermsScreen = React.lazy(() => import('../screens/main/TermsScreen'));
const PrivacyScreen = React.lazy(() => import('../screens/main/PrivacyScreen'));
const EditProfileScreen = React.lazy(() => import('../screens/main/EditProfileScreen'));
const ChangePasswordScreen = React.lazy(() => import('../screens/main/ChangePasswordScreen'));
const ChangePhoneScreen = React.lazy(() => import('../screens/main/ChangePhoneScreen'));
const ChangeEmailScreen = React.lazy(() => import('../screens/main/ChangeEmailScreen'));
const FollowRequestsScreen = React.lazy(() => import('../screens/main/FollowRequestsScreen'));
const LockScreen = React.lazy(() => import('../screens/main/LockScreen'));
import UpdateAvailableModal from '../components/common/UpdateAvailableModal';
import { BrandedStaticLoader } from '../components/common/BrandedLoader';

const Stack = createNativeStackNavigator<RootStackParamList>();

import { navigationRef } from './navigationRef';

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
const SuspenseCommunityDetail = (props: any) => (
  <React.Suspense fallback={<BrandedFallback />}>
    <CommunityDetailScreen {...props} />
  </React.Suspense>
);
const SuspenseBookmarks = (props: any) => (
  <React.Suspense fallback={<BrandedFallback />}>
    <BookmarksScreen {...props} />
  </React.Suspense>
);
const SuspenseSettings = (props: any) => (
  <React.Suspense fallback={<BrandedFallback />}>
    <SettingsScreen {...props} />
  </React.Suspense>
);
const SuspenseWallet = (props: any) => (
  <React.Suspense fallback={<BrandedFallback />}>
    <WalletScreen {...props} />
  </React.Suspense>
);
const SuspenseLeaderboards = (props: any) => (
  <React.Suspense fallback={<BrandedFallback />}>
    <LeaderboardsScreen {...props} />
  </React.Suspense>
);
const SuspenseTerms = (props: any) => (
  <React.Suspense fallback={<BrandedFallback />}>
    <TermsScreen {...props} />
  </React.Suspense>
);
const SuspensePrivacy = (props: any) => (
  <React.Suspense fallback={<BrandedFallback />}>
    <PrivacyScreen {...props} />
  </React.Suspense>
);
const SuspenseEditProfile = (props: any) => (
  <React.Suspense fallback={<BrandedFallback />}>
    <EditProfileScreen {...props} />
  </React.Suspense>
);
const SuspenseChangePassword = (props: any) => (
  <React.Suspense fallback={<BrandedFallback />}>
    <ChangePasswordScreen {...props} />
  </React.Suspense>
);
const SuspenseChangePhone = (props: any) => (
  <React.Suspense fallback={<BrandedFallback />}>
    <ChangePhoneScreen {...props} />
  </React.Suspense>
);
const SuspenseChangeEmail = (props: any) => (
  <React.Suspense fallback={<BrandedFallback />}>
    <ChangeEmailScreen {...props} />
  </React.Suspense>
);
const SuspenseFollowRequests = (props: any) => (
  <React.Suspense fallback={<BrandedFallback />}>
    <FollowRequestsScreen {...props} />
  </React.Suspense>
);
const SuspenseLockScreen = (props: any) => (
  <React.Suspense fallback={<BrandedFallback />}>
    <LockScreen {...props} />
  </React.Suspense>
);

export default function AppNavigator() {
  const { isLoggedIn, needsForceUpdate, isLoading } = useAuth();
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

  const linking = {
    prefixes: [Linking.createURL('/'), 'taddlebox://'],
    config: {
      screens: {
        Main: {
          screens: {
            HomeStack: {
              screens: {
                UserProfile: 'user/:username',
              }
            },
            Community: {
              screens: {
                CommunityDetail: 'community/:communitySlug',
              }
            }
          }
        },
        UserProfile: 'user/:username',
        ChatInbox: 'messages',
        Chat: 'messages/:conversationId',
      },
    },
  };

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme} linking={linking as any}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'none' }}>
        {needsForceUpdate ? (
          <Stack.Screen name="ForceUpdate" component={ForceUpdateScreen} />
        ) : isLoading ? (
          // While auth is loading, render a blank screen — splash overlay covers
          // this. We must NOT render AuthNavigator here because hasSeenOnboarding
          // is false until checkToken completes, causing the onboarding screen to
          // flash on every hot reload.
          <Stack.Screen name="Loading" component={() => null} />
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
            <Stack.Screen
              name="CommunityDetail"
              component={SuspenseCommunityDetail}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="ChatInbox"
              component={ChatInboxScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="Bookmarks"
              component={SuspenseBookmarks}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="Settings"
              component={SuspenseSettings}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="Wallet"
              component={SuspenseWallet}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="Leaderboards"
              component={SuspenseLeaderboards}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="Terms"
              component={SuspenseTerms}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="Privacy"
              component={SuspensePrivacy}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="EditProfile"
              component={SuspenseEditProfile}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="ChangePassword"
              component={SuspenseChangePassword}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="ChangePhone"
              component={SuspenseChangePhone}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="ChangeEmail"
              component={SuspenseChangeEmail}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="FollowRequests"
              component={SuspenseFollowRequests}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="LockScreen"
              component={SuspenseLockScreen}
              options={{ presentation: 'fullScreenModal' }}
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
