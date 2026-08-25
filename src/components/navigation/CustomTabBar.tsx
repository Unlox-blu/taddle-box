import React, { useState, useEffect } from 'react';
import {
  View, TouchableOpacity, Text, StyleSheet, Pressable, ActivityIndicator, DeviceEventEmitter
} from 'react-native';
import { notificationBus } from "../../lib/notificationBus";
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radii, fontSizes } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { useGlobalScroll } from '../../context/ScrollContext';
import { useAuth } from '../../context/AuthContext';
import BrandedLottieLoader from '../common/BrandedLoader';
const CreatePostModal = React.lazy(() => import('../common/CreatePostModal'));
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

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
  const { footerTranslateY } = useGlobalScroll();
  const { accounts, user, switchAccount } = useAuth();
  const [createVisible, setCreateVisible] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  useEffect(() => {
    const sub1 = notificationBus.on('postSubmitting', () => setIsPosting(true));
    const sub2 = notificationBus.on('postCompleted', () => setIsPosting(false));
    const sub3 = notificationBus.on('chatScreenOpen', () => setChatOpen(true));
    const sub4 = notificationBus.on('chatScreenClose', () => setChatOpen(false));
    return () => { sub1(); sub2(); sub3(); sub4(); };
  }, []);
  const [preselectedCommunityId, setPreselectedCommunityId] = useState<string | undefined>(undefined);
  const lastPressRef = React.useRef<Record<string, number>>({});

  const tabBarBg = isDark ? 'rgba(7,7,20,0.97)' : 'rgba(250,250,255,0.97)';

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: footerTranslateY.value }],
    };
  });

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
          const now = Date.now();
          const lastPress = lastPressRef.current[routeName] || 0;
          const isDoubleTap = now - lastPress < 300;
          lastPressRef.current[routeName] = now;

          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          // Special case: Double tap on Profile from anywhere switches accounts
          if (isDoubleTap && routeName === 'Profile' && accounts && accounts.length > 1) {
            const currentIdx = accounts.findIndex(a => String(a.userId) === String(user?.id));
            const nextAccount = accounts[(currentIdx + 1) % accounts.length];
            if (nextAccount && String(nextAccount.userId) !== String(user?.id)) {
              switchAccount(nextAccount.userId);
              return;
            }
          }

          if (!active && !event.defaultPrevented) {
            navigation.navigate(routeName);
          } else if (active) {
            const eventKey = routeName.toLowerCase();
            if (isDoubleTap) {
              DeviceEventEmitter.emit(eventKey + 'DoubleTap');
            } else {
              DeviceEventEmitter.emit(eventKey + 'SingleTap');
            }
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
    } else if (activeRoute?.name === 'Games') {
      DeviceEventEmitter.emit('openGamesMatchmaking');
    } else if (activeRoute?.name === 'Events') {
      DeviceEventEmitter.emit('openEventMatchmaking');
    } else {
      setPreselectedCommunityId(undefined);
      setCreateVisible(true);
    }
  };

  const activeRoute = getActiveRouteState(navigation.getState());
  const isTabBarHidden = chatOpen || ['Chat'].includes(activeRoute?.name || '');

  return (
    <>
      <React.Suspense fallback={null}>
      <CreatePostModal 
        visible={createVisible} 
        onClose={() => setCreateVisible(false)} 
        preselectedCommunityId={preselectedCommunityId}
      />
      </React.Suspense>
      {!isTabBarHidden && (
        <Animated.View style={[styles.container, { paddingBottom: insets.bottom || 10, backgroundColor: tabBarBg, borderTopColor: colors.border }, animatedStyle]}>
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
                  {isPosting ? (
                    <View style={{ flex: 1, width: '100%', height: '100%', borderRadius: 27, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                      <BrandedLottieLoader size={64} />
                    </View>
                  ) : (
                    <Ionicons name="add" size={28} color="#fff" />
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Right tabs */}
            <View style={styles.side}>
              {RIGHT_TABS.map(renderTab)}
            </View>
          </View>
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
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
