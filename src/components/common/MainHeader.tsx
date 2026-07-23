import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fontSizes, spacing, radii } from '../../theme';
import { useThemeColors } from '../../context/ThemeContext';
import { notificationService } from '../../services/notification.service';
import SideDrawer from '../home/SideDrawer';

export default function MainHeader() {
  const colors = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isDrawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const notifRes = await notificationService.getNotifications(1, 1, true);
        if (notifRes?.meta?.unreadCount !== undefined) {
          setUnreadCount(notifRes.meta.unreadCount);
        }
      } catch (e) {
        // ignore
      }
    };
    fetchUnread();
  }, []);

  return (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={() => setDrawerOpen(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="menu-outline" size={26} color={colors.text.primary} />
      </TouchableOpacity>

      <View style={[StyleSheet.absoluteFill, { justifyContent: "center" }]} pointerEvents="none">
        <Text style={[styles.logo, { color: colors.text.primary }]}>
          TADDLEBOX
        </Text>
      </View>

      <View style={{flexDirection: 'row', alignItems: 'center'}}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.navigate("Search")}
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
          if (screen === "Bookmarks") navigation.navigate("Bookmarks" as never);
          else if (screen === "Settings") navigation.navigate("Settings" as never);
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
