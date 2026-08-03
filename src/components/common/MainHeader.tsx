import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fontSizes, spacing, radii } from '../../theme';
import { useThemeColors } from '../../context/ThemeContext';
import { useNotifications } from '../../context/NotificationContext';
import SideDrawer from '../home/SideDrawer';

export default function MainHeader() {
  const colors = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const route = useRoute();
  const [isDrawerOpen, setDrawerOpen] = useState(false);

  // Live unread badge — updated in real-time by the socket, synced to backend
  // on mount and whenever the app regains focus.
  const { unreadCount, refreshUnread } = useNotifications();

  useEffect(() => {
    refreshUnread();
    const sub = navigation.addListener('focus', refreshUnread);
    return sub;
  }, [navigation, refreshUnread]);

  return (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={() => setDrawerOpen(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="menu-outline" size={26} color={colors.text.primary} />
      </TouchableOpacity>

      <View style={[StyleSheet.absoluteFill, { justifyContent: "center", alignItems: 'center' }]} pointerEvents="none">
        <Image
          source={require('../../../Taddle_Box_Banner.png')}
          style={{ height: 28, width: 140, resizeMode: 'contain', marginTop: 2 }} 
        />
      </View>

      <View style={{flexDirection: 'row', alignItems: 'center'}}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => {
            let tab = 'all';
            if (route.name === 'HomeMain') tab = 'all';
            else if (route.name === 'Profile' || route.name === 'UserProfile') tab = 'people';
            else if (route.name === 'Community' || route.name === 'CommunityList' || route.name === 'CommunityDetail') tab = 'communities';
            else if (route.name === 'Events') tab = 'events';
            else tab = 'posts'; // fallback
            
            navigation.navigate("Search", { tab });
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="search-outline" size={22} color={colors.text.secondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.navigate("Notifications")}
          activeOpacity={0.7}
        >
          <Ionicons name="notifications-outline" size={22} color={colors.text.secondary} />
          {unreadCount > 0 && (
            <View style={[styles.notifDot, { borderColor: colors.bg.base }]}>
              <Text style={styles.notifDotText}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <SideDrawer
        visible={isDrawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNavigateTab={(tab) => navigation.getParent()?.navigate(tab as never)}
	        onNavigateStack={(screen) => {
	          navigation.navigate(screen as never);
	        }}
        onProfile={() => navigation.getParent()?.navigate("Profile" as never)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
  },
  logo: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: fontSizes.xl,
    fontWeight: "900",
    letterSpacing: 1.5,
    zIndex: -1,
  },
  notifDot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  notifDotText: { fontSize: 7, color: "#fff", fontWeight: "800" },
});
