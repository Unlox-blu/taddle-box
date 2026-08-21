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
import TabErrorBoundary from '../components/common/TabErrorBoundary';

const Tab = createBottomTabNavigator<MainTabParamList>();

/** Wraps a screen component with TabErrorBoundary so a crash in one tab */
function withTabBoundary(Screen: React.ComponentType<any>, tabName: string) {
  const Wrapped = (props: any) => (
    <TabErrorBoundary tabName={tabName}>
      <Screen {...props} />
    </TabErrorBoundary>
  );
  Wrapped.displayName = `TabBoundary(${tabName})`;
  return Wrapped;
}

// IMPORTANT: Create wrapped components at module level so the component
// identity is STABLE across renders. Creating them inside the render function
// would make React see a new component type on every render, causing
// unmount/remount cascades (infinite update depth).
const HomeBounded      = withTabBoundary(HomeStackNavigator, 'Home');
const CommunityBounded = withTabBoundary(CommunityStackNavigator, 'Community');
const EventsBounded    = withTabBoundary(EventsScreen, 'Events');
const GamesBounded     = withTabBoundary(GamesScreen, 'Games');
const WalletBounded    = withTabBoundary(WalletScreen, 'Wallet');
const ProfileBounded   = withTabBoundary(ProfileScreen, 'Profile');

export default function MainNavigator() {
  return (
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props} />}
      // Lazy tabs: each screen mounts on FIRST focus only, so the startup burst
      // (events/discover, communities/discover, game/trending, posts/user, …)
      // no longer fires for tabs the user never opened.
      screenOptions={{ headerShown: false, lazy: true }}
    >
      <Tab.Screen name="Home"      component={HomeBounded}      />
      <Tab.Screen name="Community" component={CommunityBounded} />
      <Tab.Screen name="Events"    component={EventsBounded}    />
      <Tab.Screen name="Games"     component={GamesBounded}     />
      <Tab.Screen name="Wallet"    component={WalletBounded}    />
      <Tab.Screen name="Profile"   component={ProfileBounded}   />
    </Tab.Navigator>
  );
}
