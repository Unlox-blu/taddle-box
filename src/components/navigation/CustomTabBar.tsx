import React, { useState } from 'react';
import {
  View, TouchableOpacity, Text, StyleSheet, DeviceEventEmitter
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radii, fontSizes } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import CreatePostModal from '../common/CreatePostModal';

// Helper to deeply find the active route name and params
const getActiveRouteState = (state: any): { name: string, params: any } | null => {
  if (!state) return null;
  if (state.routes && typeof state.index === 'number') {
    return getActiveRouteState(state.routes[state.index]);
  }
  if (state.state) {
    return getActiveRouteState(state.state);
  }
  return { name: state.name, params: state.params || {} };
};

type IconName = keyof typeof Ionicons.glyphMap;

const TAB_CONFIG: Record<string, { label: string; icon: IconName; activeIcon: IconName }> = {
  Home:      { label: 'Home',      icon: 'home-outline',              activeIcon: 'home'             },
  Community: { label: 'Community', icon: 'people-outline',            activeIcon: 'people'           },
  Events:    { label: 'Events',    icon: 'calendar-outline',          activeIcon: 'calendar'         },
  Games:     { label: 'Games',     icon: 'game-controller-outline',   activeIcon: 'game-controller'  },
  Wallet:    { label: 'Wallet',    icon: 'wallet-outline',            activeIcon: 'wallet'           },
  Profile:   { label: 'Profile',   icon: 'person-outline',            activeIcon: 'person'           },
};

const LEFT_TABS  = ['Home', 'Community'];
const RIGHT_TABS = ['Games', 'Events'];

export default function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [createVisible, setCreateVisible] = useState(false);
  const [preselectedCommunityId, setPreselectedCommunityId] = useState<string | undefined>(undefined);
  const lastPressRef = React.useRef<Record<string, number>>({});

  const tabBarBg = isDark ? 'rgba(7,7,20,0.97)' : 'rgba(250,250,255,0.97)';

  const renderTab = (routeName: string) => {
    const route  = state.routes.find(r => r.name === routeName);
    if (!route) return null;
    const index  = state.routes.indexOf(route);
    const active = state.index === index;
    const cfg    = TAB_CONFIG[routeName];

    return (
      <TouchableOpacity
        key={routeName}
        style={styles.tab}
        onPress={() => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!active && !event.defaultPrevented) {
            navigation.navigate(routeName);
          } else if (active) {
            const now = Date.now();
            const lastPress = lastPressRef.current[routeName] || 0;
            if (now - lastPress < 300) {
              if (routeName === 'Home') DeviceEventEmitter.emit('homeDoubleTap');
              if (routeName === 'Community') DeviceEventEmitter.emit('communityDoubleTap');
            }
            lastPressRef.current[routeName] = now;
          }
        }}
        activeOpacity={0.7}
      >
        <Ionicons
          name={active ? cfg.activeIcon : cfg.icon}
          size={22}
          color={active ? colors.primaryLight : colors.text.muted}
        />
        <Text style={[styles.tabLabel, { color: active ? colors.primaryLight : colors.text.muted }]}>
          {cfg.label}
        </Text>
        {active && <View style={[styles.activeIndicator, { backgroundColor: colors.primaryLight }]} />}
      </TouchableOpacity>
    );
  };

  const handleFabPress = () => {
    const activeRoute = getActiveRouteState(navigation.getState());
    
    if (activeRoute?.name === 'CommunityList' || activeRoute?.name === 'Community') {
      DeviceEventEmitter.emit('openCreateCommunity');
    } else if (activeRoute?.name === 'CommunityDetail') {
      setPreselectedCommunityId(activeRoute.params?.communitySlug || activeRoute.params?.id); // The param is usually communitySlug or id
      setCreateVisible(true);
    } else {
      setPreselectedCommunityId(undefined);
      setCreateVisible(true);
    }
  };

  return (
    <>
      <CreatePostModal 
        visible={createVisible} 
        onClose={() => setCreateVisible(false)} 
        preselectedCommunityId={preselectedCommunityId}
      />
      <View style={[styles.container, { paddingBottom: insets.bottom || 10, backgroundColor: tabBarBg, borderTopColor: colors.border }]}>
        <View style={styles.inner}>
          {/* Left tabs */}
          <View style={styles.side}>
            {LEFT_TABS.map(renderTab)}
          </View>

          {/* Center FAB */}
          <View style={styles.fabWrapper}>
            <TouchableOpacity activeOpacity={0.85} onPress={handleFabPress}>
              <LinearGradient
                colors={[colors.primary, colors.cyanDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.fab}
              >
                <Ionicons name="add" size={28} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Right tabs */}
          <View style={styles.side}>
            {RIGHT_TABS.map(renderTab)}
          </View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    paddingTop: 8,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 4,
  },
  side: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingBottom: 2,
    position: 'relative',
  },
  tabLabel: {
    fontSize: fontSizes.xs - 1,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -6,
    width: 20,
    height: 3,
    borderRadius: radii.full,
  },
  fabWrapper: {
    alignItems: 'center',
    marginBottom: 2,
    gap: 3,
    width: 64,
  },
  fab: {
    width: 54, height: 54,
    borderRadius: 27,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 10,
  },
  fabLabel: {
    fontSize: fontSizes.xs - 1,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});
