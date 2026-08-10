import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { CommunityStackParamList } from '../types';
import CommunityScreen       from '../screens/main/CommunityScreen';
import CommunityDetailScreen from '../screens/main/CommunityDetailScreen';
import CommunitySettingsScreen from '../screens/main/CommunitySettingsScreen';
import ManageRequestsScreen from '../screens/main/ManageRequestsScreen';
import CommunityModerationLogScreen from '../screens/main/CommunityModerationLogScreen';

const Stack = createNativeStackNavigator<CommunityStackParamList>();

export default function CommunityStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CommunityList"   component={CommunityScreen}       />
      <Stack.Screen name="CommunityDetail" component={CommunityDetailScreen} />
      <Stack.Screen name="CommunitySettings" component={CommunitySettingsScreen} />
      <Stack.Screen name="ManageRequests" component={ManageRequestsScreen} />
      <Stack.Screen name="ModerationLog" component={CommunityModerationLogScreen} />
    </Stack.Navigator>
  );
}
