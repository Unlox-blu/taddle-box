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
const SearchScreen         = React.lazy(() => import('../screens/main/SearchScreen'));
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

      <Stack.Screen name="Search"         component={SearchScreen}         options={{ animation: 'fade' }} />

    </Stack.Navigator>
    </React.Suspense>
  );
}
