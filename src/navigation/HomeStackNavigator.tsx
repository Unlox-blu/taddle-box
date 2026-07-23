import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../types';

import HomeScreen           from '../screens/main/HomeScreen';
import NotificationsScreen  from '../screens/main/NotificationsScreen';
import CommentsScreen       from '../screens/main/CommentsScreen';
import UserProfileScreen    from '../screens/main/UserProfileScreen';
import StoryViewerScreen    from '../screens/main/StoryViewerScreen';
import BookmarksScreen      from '../screens/main/BookmarksScreen';
import SettingsScreen       from '../screens/main/SettingsScreen';
import SearchScreen         from '../screens/main/SearchScreen';

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
      <Stack.Screen name="Bookmarks" component={BookmarksScreen} />
      <Stack.Screen name="Settings"  component={SettingsScreen}  />
      <Stack.Screen name="Search"    component={SearchScreen}  options={{ animation: 'fade' }} />
    </Stack.Navigator>
  );
}
