import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../types';

import HomeScreen           from '../screens/main/HomeScreen';
import NotificationsScreen  from '../screens/main/NotificationsScreen';
import CommentsScreen       from '../screens/main/CommentsScreen';
import UserProfileScreen    from '../screens/main/UserProfileScreen';
import StoryViewerScreen    from '../screens/main/StoryViewerScreen';
import BookmarksScreen      from '../screens/main/BookmarksScreen';
import LeaderboardsScreen   from '../screens/main/LeaderboardsScreen';
import SettingsScreen       from '../screens/main/SettingsScreen';
import LockScreen           from '../screens/main/LockScreen';
import SearchScreen         from '../screens/main/SearchScreen';
import EditProfileScreen    from '../screens/main/EditProfileScreen';
import TermsScreen          from '../screens/main/TermsScreen';
import PrivacyScreen        from '../screens/main/PrivacyScreen';
import ChangePasswordScreen from '../screens/main/ChangePasswordScreen';
import ChangePhoneScreen    from '../screens/main/ChangePhoneScreen';
import ChangeEmailScreen    from '../screens/main/ChangeEmailScreen';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStackNavigator() {
  return (
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
      <Stack.Screen name="Search"         component={SearchScreen}         options={{ animation: 'fade' }} />
    </Stack.Navigator>
  );
}
