import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../types';

// HomeScreen is the default tab — keep it eager for instant first render.
import HomeScreen from '../screens/main/HomeScreen';

// Lazy-load all other screens so their JS initialization is deferred
// until the user actually navigates to them. This reduces startup memory.
const NotificationsScreen  = React.lazy(() => import('../screens/main/NotificationsScreen'));
const CommentsScreen       = React.lazy(() => import('../screens/main/CommentsScreen'));
const UserProfileScreen    = React.lazy(() => import('../screens/main/UserProfileScreen'));
const StoryViewerScreen    = React.lazy(() => import('../screens/main/StoryViewerScreen'));
const BookmarksScreen      = React.lazy(() => import('../screens/main/BookmarksScreen'));
const LeaderboardsScreen   = React.lazy(() => import('../screens/main/LeaderboardsScreen'));
const SettingsScreen       = React.lazy(() => import('../screens/main/SettingsScreen'));
const LockScreen           = React.lazy(() => import('../screens/main/LockScreen'));
const SearchScreen         = React.lazy(() => import('../screens/main/SearchScreen'));
const EditProfileScreen    = React.lazy(() => import('../screens/main/EditProfileScreen'));
const TermsScreen          = React.lazy(() => import('../screens/main/TermsScreen'));
const PrivacyScreen        = React.lazy(() => import('../screens/main/PrivacyScreen'));
const ChangePasswordScreen = React.lazy(() => import('../screens/main/ChangePasswordScreen'));
const FollowRequestsScreen = React.lazy(() => import('../screens/main/FollowRequestsScreen'));
const ChangePhoneScreen    = React.lazy(() => import('../screens/main/ChangePhoneScreen'));
const ChangeEmailScreen    = React.lazy(() => import('../screens/main/ChangeEmailScreen'));
const ChatInboxScreen      = React.lazy(() => import('../screens/main/ChatInboxScreen'));
const ChatScreen            = React.lazy(() => import('../screens/main/ChatScreen'));

const LazyFallback = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <ActivityIndicator size="small" color="#7C3AED" />
  </View>
);

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStackNavigator() {
  return (
    <React.Suspense fallback={<LazyFallback />}>
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain"       component={HomeScreen}          />
      <Stack.Screen name="Notifications"  component={NotificationsScreen} />
      <Stack.Screen name="Comments"       component={CommentsScreen}      />
      <Stack.Screen name="UserProfile"    component={UserProfileScreen}   />
      <Stack.Screen
        name="StoryViewer"
        component={StoryViewerScreen}
        options={{ animation: 'fade', gestureEnabled: false }}
      />
	      <Stack.Screen name="Bookmarks"    component={BookmarksScreen} />
	      <Stack.Screen name="Leaderboards" component={LeaderboardsScreen} options={{ animation: 'slide_from_right' }} />
	      <Stack.Screen name="Settings"     component={SettingsScreen}  />
      <Stack.Screen name="EditProfile"  component={EditProfileScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Terms"        component={TermsScreen}       options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Privacy"      component={PrivacyScreen}     options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="LockScreen"     component={LockScreen}           options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="ChangePhone"    component={ChangePhoneScreen}    options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="ChangeEmail"    component={ChangeEmailScreen}    options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="FollowRequests" component={FollowRequestsScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Search"         component={SearchScreen}         options={{ animation: 'fade' }} />
      <Stack.Screen name="ChatInbox"      component={ChatInboxScreen}      options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Chat"           component={ChatScreen}           options={{ animation: 'slide_from_right' }} />
    </Stack.Navigator>
    </React.Suspense>
  );
}
