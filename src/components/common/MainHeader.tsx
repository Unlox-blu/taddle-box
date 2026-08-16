import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { fontSizes, spacing, radii } from "../../theme";
import { useTheme, useThemeColors } from "../../context/ThemeContext";
import { useNotifications } from "../../context/NotificationContext";
import { useAuth } from "../../context/AuthContext";
import { useGlobalScroll } from "../../context/ScrollContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SideDrawer from "../home/SideDrawer";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

export default function MainHeader({
  showBack = false,
}: {
  showBack?: boolean;
}) {
  const colors = useThemeColors();
  const { isDark } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const { user: currentUser } = useAuth();
  const { headerTranslateY, footerTranslateY } = useGlobalScroll();

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: headerTranslateY.value }],
    };
  });

  // The header/footer positions are GLOBAL shared values. Scrolling hides
  // them (translateY up/down), but only scrollables wrapped in
  // PullToRefreshWrapper update them — screens with plain ScrollViews
  // (Wallet, Settings) or pushed screens never reset them, so the header
  // could stay hidden forever after leaving a scrolled feed. Snap both back
  // to fully visible whenever this screen gains focus — the Instagram
  // behavior of a fresh header on every screen.
  useFocusEffect(
    React.useCallback(() => {
      headerTranslateY.value = 0;
      footerTranslateY.value = 0;
    }, [headerTranslateY, footerTranslateY]),
  );

  // Live unread badge — kept fresh by NotificationContext: it syncs on login,
  // socket (re)connect, and increments in real-time on incoming notifications.
  // NOTE: do NOT add a per-focus refreshUnread() here — MainHeader mounts on
  // every tab screen (lazy:false), so a focus listener fires the notifications
  // API on EVERY tab click (Community/Events/…), spamming the backend.
  const { unreadCount } = useNotifications();

  return (
    <Animated.View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bg.base, paddingTop: insets.top + 4 }, animatedStyle]}>
      {showBack ? (
        // Pushed screens (community detail, settings, bookmarks, …) keep the
        // main header — logo, global search, notifications — with a back arrow
        // in place of the drawer menu.
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => setDrawerOpen(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="menu-outline" size={26} color={colors.text.primary} />
        </TouchableOpacity>
      )}

      <View
        style={[
          {
            position: "absolute",
            left: 0,
            right: 0,
            // Center the banner against the CONTENT row, not the whole padded
            // box — absoluteFill would center it insets.top/2 higher than the
            // menu/search icons (right up against the status bar).
            top: insets.top + 4,
            bottom: 10,
          },
          { justifyContent: "center", alignItems: "center" },
        ]}
        pointerEvents="none"
      >
        {/* The banner is ALWAYS the PNG — no .lottie path. The banner
            animation (S3_APP_BANNER_LOTTIE_URL) is unreachable (AccessDenied
            on S3) and, when it survived via stale cache, rendered baked-in
            artwork that ignored the theme (untinted in dark mode, wrong
            colors on some screens). The PNG is tinted white in dark mode so
            it reads correctly on the dark header, original (black +
            brand-color) untinted in light.

            The `key` is CRITICAL for live theme switches on iOS: a cached
            native image does not re-apply a changed tintColor, so without it
            the banner keeps its old tint until the app reloads. Remounting
            via key forces the tint to re-render instantly. */}
        <Image
          key={isDark ? "banner-dark" : "banner-light"}
          source={require("../../../Taddle_Box_Banner.png")}
          style={{
            height: 28,
            width: 140,
            resizeMode: "contain",
            marginTop: 2,
            ...(isDark ? { tintColor: colors.text.primary } : null),
          }}
        />
      </View>

      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => {
            let tab = "all";
            // Reddit-style scoping: opening search from inside a community
            // detail page searches WITHIN that community (posts only); from a
            // profile page it auto-applies the @username filter so the box
            // opens pre-scoped to that person's content.
            let scopeCommunity: string | undefined;
            let authorFilter: string | undefined;
            // `source` scopes to a non-unified local search (bookmarks/settings/
            // notifications/wallet); `type` pre-selects the server result pill
            // (events/games/communities) so those tabs search their own domain.
            let source:
              | "bookmarks"
              | "settings"
              | "notifications"
              | "wallet"
              | undefined;
            let type: string | undefined;
            if (route.name === "HomeMain") tab = "all";
            else if (route.name === "Profile") {
              tab = "posts";
              authorFilter = currentUser?.username;
            } else if (route.name === "UserProfile") {
              tab = "posts";
              authorFilter =
                (route.params as any)?.user?.username || currentUser?.username;
            } else if (
              route.name === "Community" ||
              route.name === "CommunityList"
            )
              type = "communities";
            else if (route.name === "CommunityDetail") {
              tab = "posts";
              scopeCommunity = (route.params as any)?.communitySlug;
            } else if (route.name === "Events") type = "events";
            else if (route.name === "Games") type = "games";
            // Search from Wallet is scoped to the user's transactions.
            else if (route.name === "Wallet") source = "wallet";
            // Search from Bookmarks is scoped to saved posts; from Settings it
            // scopes to the viewer's own posts.
            else if (route.name === "Bookmarks") {
              tab = "posts";
              source = "bookmarks";
            } else if (route.name === "Settings") {
              tab = "posts";
              source = "settings";
            } else if (route.name === "Notifications") {
              tab = "posts";
              source = "notifications";
            } else tab = "posts"; // fallback

            const params: any = { tab };
            if (scopeCommunity) params.scopeCommunity = scopeCommunity;
            if (authorFilter) params.authorFilter = authorFilter;
            if (source) params.source = source;
            if (type) params.type = type;
            navigation.navigate("Search", params);
          }}
          activeOpacity={0.7}
        >
          <Ionicons
            name="search-outline"
            size={22}
            color={colors.text.secondary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.navigate("Notifications")}
          activeOpacity={0.7}
        >
          <Ionicons
            name="notifications-outline"
            size={22}
            color={colors.text.secondary}
          />
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
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
