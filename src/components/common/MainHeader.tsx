import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
import { notificationBus } from "../../lib/notificationBus";
import { Ionicons } from "@expo/vector-icons";
import {
  useNavigation,
  useRoute,
  useFocusEffect,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { fontSizes, spacing, radii } from "../../theme";
import { useTheme, useThemeColors } from "../../context/ThemeContext";
import { useNotifications } from "../../context/NotificationContext";
import { useAuth } from "../../context/AuthContext";
import { useGlobalScroll } from "../../context/ScrollContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SideDrawer from "../home/SideDrawer";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { accountSocket } from "../../services/accountSocketClient";
import { chatService } from "../../services/chat.service";

export default function MainHeader({
  showBack = false,
  hideNotifIcon = false,
}: {
  showBack?: boolean;
  hideNotifIcon?: boolean;
}) {
  const colors = useThemeColors();
  const { isDark } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const route = useRoute();
  const shouldHideNotif = hideNotifIcon || route.name === "Notifications";
  const insets = useSafeAreaInsets();
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const { user: currentUser, accounts, switchAccount } = useAuth();
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
  const { unreadCount, inactiveUnreadStatus } = useNotifications();
  const otherAccounts = accounts.filter(
    (a) => String(a.userId) !== String(currentUser?.id),
  );
  const hasInactiveUnread = otherAccounts.some(
    (a) => inactiveUnreadStatus[String(a.userId)],
  );

  // ── Chat Unread Logic ──
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  useEffect(() => {
    const fetchInbox = () => {
      chatService
        .getInbox(1, 10)
        .then((res) => {
          const count =
            res.conversations?.reduce(
              (acc: number, c: any) => acc + (c.unread_count || 0),
              0,
            ) || 0;
          setUnreadChatCount(count);
        })
        .catch(() => {});
    };
    fetchInbox();

    // Listen to real-time chat messages
    const handleChatMessage = (data: any) => {
      if (data.sender_id && data.sender_id !== currentUser?.id) {
        setUnreadChatCount((prev) => prev + 1);
      }
    };
    accountSocket.events.on("chat:message" as any, handleChatMessage);
    const unsubscribe = notificationBus.on("chat_inbox_updated", fetchInbox);
    // @ts-ignore
    window._mainHeaderSubCleanup = unsubscribe;

    return () => {
      accountSocket.events.off("chat:message" as any, handleChatMessage);
      // @ts-ignore
      if (window._mainHeaderSubCleanup) window._mainHeaderSubCleanup();
    };
  }, [currentUser?.id]);

  const lastTapRef = useRef<number>(0);
  const singleTapTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleAvatarPress = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double tap detected
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);

      const nextAcc = accounts.find((a) => a.userId !== currentUser?.id);
      if (nextAcc) {
        switchAccount(nextAcc.userId);
      }
    } else {
      // Wait to see if it's a double tap before opening the drawer
      singleTapTimerRef.current = setTimeout(() => {
        setDrawerOpen(true);
      }, 250);
    }
    lastTapRef.current = now;
  };

  return (
    <Animated.View
      style={[
        styles.header,
        {
          borderBottomColor: colors.border,
          backgroundColor: colors.bg.base,
          paddingTop: insets.top + 4,
        },
        animatedStyle,
      ]}
    >
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
          style={[
            styles.iconBtn,
            { padding: 0, justifyContent: "center", alignItems: "center" },
          ]}
          onPress={handleAvatarPress}
          activeOpacity={0.7}
        >
          {currentUser?.avatarUrl ? (
            <Image
              source={{ uri: currentUser.avatarUrl }}
              style={{ width: 30, height: 30, borderRadius: 15 }}
            />
          ) : (
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: colors.bg.card,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: colors.text.primary,
                  fontSize: 14,
                  fontWeight: "bold",
                }}
              >
                {(currentUser?.name || "U").charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          {(unreadChatCount > 0 || hasInactiveUnread) && (
            <View
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: colors.danger,
                borderWidth: 1.5,
                borderColor: colors.bg.base,
              }}
            />
          )}
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
              | "messages"
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
            else if (route.name === "ChatInbox") source = "messages";
            else if (route.name === "Chat") {
              source = "messages";
              authorFilter =
                (route.params as any)?.otherUser?.username ||
                (route.params as any)?.otherUserId ||
                "";
            }
            // Search from Bookmarks is scoped to saved items; from Settings it
            // scopes to the viewer's own items.
            else if (route.name === "Bookmarks") {
              tab = "all";
              source = "bookmarks";
            } else if (route.name === "Settings") {
              tab = "all";
              source = "settings";
            } else if (route.name === "Notifications") {
              tab = "all";
              source = "notifications";
            } else tab = "all"; // fallback

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

        {!shouldHideNotif && (
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
        )}
      </View>

      <SideDrawer
        visible={isDrawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNavigateTab={(tab) => navigation.navigate(tab as never)}
        onNavigateStack={(screen) => navigation.navigate(screen as never)}
        onProfile={() => navigation.navigate("Profile" as never)}
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
