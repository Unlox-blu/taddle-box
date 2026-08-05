import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from '../types';

import HomeStackNavigator      from './HomeStackNavigator';
import CommunityStackNavigator from './CommunityStackNavigator';
import EventsScreen            from '../screens/main/EventsScreen';
import GamesScreen      from '../screens/main/GamesScreen';
import WalletScreen     from '../screens/main/WalletScreen';
import ProfileScreen    from '../screens/main/ProfileScreen';
import CustomTabBar     from '../components/navigation/CustomTabBar';

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainNavigator() {
  return (
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props} />}
      // Lazy tabs: each screen mounts on FIRST focus only, so the startup burst
      // (events/discover, communities/discover, game/trending, posts/user, …)
      // no longer fires for tabs the user never opened.
      screenOptions={{ headerShown: false, lazy: true }}
    >
      <Tab.Screen name="Home"      component={HomeStackNavigator}      />
      <Tab.Screen name="Community" component={CommunityStackNavigator} />
      <Tab.Screen name="Events"    component={EventsScreen}    />
      <Tab.Screen name="Games"     component={GamesScreen}     />
      <Tab.Screen name="Wallet"    component={WalletScreen}    />
      <Tab.Screen name="Profile"   component={ProfileScreen}   />
    </Tab.Navigator>
  );
}
