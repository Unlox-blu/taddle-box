import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Animated,
  StyleSheet,
  Dimensions,
  ScrollView,
  Modal,
  Image,
  Share,
  Platform,
} from "react-native";
import { notificationBus } from "../../shared/state/notification-bus";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { fontSizes, spacing, radii } from "../../design-system";
import { useThemeColors } from "../../design-system/theme/ThemeProvider";
import { useAuth } from "../../features/auth/state/AuthProvider";
import { xpService } from "../../features/progression/api/xp.api";
import { getReferralRewards } from "../../infrastructure/config/app-config";
import { appVersionLabel } from "../../infrastructure/app-version";
import XPProgressBar from "../../features/progression/components/XPProgressBar";
import LevelInfoModal from "../../features/progression/components/LevelInfoModal";
import { themedAlert } from "../../design-system/components/ThemedAlert";
import { useThemedAlertModal } from "../../design-system/components/ThemedAlert";
import { useTheme } from "../../design-system/theme/ThemeProvider";
import { chatService } from "../../features/chat/api/chat.api";
import { error } from "../../infrastructure/logging/logger";

import { useNotifications } from "../../features/notifications/state/NotificationProvider";

const { width: SW } = Dimensions.get("window");
const DRAWER_W = Math.min(Math.round(SW * 0.82), 320);
const CLOSE_DELAY = Platform.OS === "ios" ? 450 : 280; // Give iOS extra time to unmount the Modal before navigating

interface Props {
  visible: boolean;
  onClose: () => void;
}

type MenuRow = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  badge?: string;
  /** Small muted line under the label (e.g. the referral XP reward). */
  subtitle?: string;
  onPress: () => void;
  purple?: boolean;
};

export default function SideDrawer({ visible, onClose }: Props) {
  const {
    user,
    signOut,
    goToAddAccount,
    accounts,
    switchAccount,
    removeAccountFromDevice,
  } = useAuth();
  const insets = useSafeAreaInsets();
  const { isDark, colors } = useTheme();
  useThemedAlertModal(visible, onClose);
  const { inactiveUnreadStatus } = useNotifications();
  const [accountsExpanded, setAccountsExpanded] = useState(false);
  const otherAccounts = accounts.filter(
    (a) => String(a.userId) !== String(user?.id),
  );

  const hasInactiveUnread = otherAccounts.some(
    (a) => inactiveUnreadStatus[String(a.userId)],
  );

  const [localXP, setLocalXP] = useState(0);
  const [totalXP, setTotalXP] = useState(0);
  const [levelInfoVisible, setLevelInfoVisible] = useState(false);
  // Backend-controlled referral reward (joiner side) — never hardcoded.
  const [referralXp, setReferralXp] = useState<number | null>(null);

  // Chat unread count — socket-driven via NotificationProvider, no local fetch.
  const { unreadChatCount } = useNotifications();

  const slideX = useRef(new Animated.Value(-DRAWER_W)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const cfg = visible
      ? { slide: 0, back: 1, dur: 280 }
      : { slide: -DRAWER_W, back: 0, dur: 220 };
    Animated.parallel([
      Animated.spring(slideX, {
        toValue: cfg.slide,
        damping: 24,
        stiffness: 220,
        useNativeDriver: true,
      }),
      Animated.timing(backdrop, {
        toValue: cfg.back,
        duration: cfg.dur,
        useNativeDriver: true,
      }),
    ]).start();

    if (visible) {
      // Fetch dynamic XP when drawer opens
      xpService
        .getXP()
        .then((res) => {
          if (res?.data?.Xp !== undefined) {
            setLocalXP(res.data.Xp);
            setTotalXP(res.data.totalXpEarned || res.data.Xp);
          }
        })
        .catch((err) => error("Failed to fetch XP for drawer", err));

      // Referral reward amount lives in the backend — pull it for display.
      getReferralRewards()
        .then((rewards) => setReferralXp(rewards?.joinerXp ?? null))
        .catch(() => setReferralXp(null));
    }
  }, [visible]);

  // Delay navigation until after the close animation finishes — prevents flicker.
  const go = (
    href: string | { pathname: string; params?: Record<string, string> },
  ) => {
    onClose();
    setTimeout(() => router.push(href as never), CLOSE_DELAY);
  };

  const shareReferral = async () => {
    const code = user?.referralCode || user?.referral_code;
    if (!code) {
      themedAlert(
        "Referral Unavailable",
        "Your referral code isn't ready yet. Please try again in a moment.",
      );
      return;
    }
    onClose();
    const reward =
      referralXp != null ? `get ${referralXp} XP free` : "get bonus XP";
    const message = `🎮 Join me on TaddleBox! Use my referral code ${code} at signup and ${reward}. Let's play, post and win together! 🚀`;
    setTimeout(() => {
      Share.share({ message }).catch(() => {});
    }, CLOSE_DELAY);
  };

  const mainMenu: MenuRow[] = [
    {
      icon: "gift-outline",
      label: "Share Referral",
      subtitle:
        referralXp != null
          ? `You & your friend get ${referralXp} XP each`
          : "You & your friend get XP when they join",
      purple: true,
      onPress: shareReferral,
    },
    {
      icon: "wallet-outline",
      label: "Wallet",
      purple: true,
      onPress: () => {
        if (user?.globalAccountLockEnabled) {
          go({
            pathname: "/lock",
            params: { mode: "app", returnScreen: "/wallet" },
          });
        } else {
          go("/wallet");
        }
      },
    },
    {
      icon: "bookmark-outline",
      label: "Bookmarks",
      purple: true,
      onPress: () => go("/bookmarks"),
    },
  ];

  const moreMenu: MenuRow[] = [
    {
      icon: "shield-checkmark-outline",
      label: "Privacy Policy",
      onPress: () => go("/privacy"),
    },
    {
      icon: "document-text-outline",
      label: "User Agreement",
      onPress: () => go("/terms"),
    },
    {
      icon: "settings-outline",
      label: "Settings",
      onPress: () => go("/settings"),
    },
  ];

  const level = Math.floor(totalXP / 1000) + 1;
  const rank = level < 5 ? "Beginner" : level < 15 ? "Intermediate" : "Pro";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Full-screen container so touches outside the panel dismiss */}
      <View style={styles.modalRoot} pointerEvents="box-none">
        {/* Dimmed backdrop */}
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]} />

        {/* Tap zone to the right of the drawer — sits on top of everything */}
        <Pressable
          style={[styles.dismissZone, { left: DRAWER_W }]}
          onPress={onClose}
        />

        <Animated.View
          style={[
            styles.panel,
            {
              transform: [{ translateX: slideX }],
              paddingTop: insets.top + 8,
              backgroundColor: colors.bg.surface,
              borderRightColor: colors.borderHover,
            },
          ]}
        >
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {/* ── Profile header ── */}
            <View style={styles.profileContainer}>
              <View style={styles.profileRow}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                  onPress={() => go("/profile")}
                  activeOpacity={0.75}
                >
                  <LinearGradient
                    colors={["#4C1D95", "#7C3AED"]}
                    style={styles.avatar}
                  >
                    {user?.avatarUrl ? (
                      <Image
                        source={{ uri: user.avatarUrl }}
                        style={styles.avatarImage}
                      />
                    ) : (
                      <Text style={styles.avatarText}>👾</Text>
                    )}
                  </LinearGradient>
                  <View style={styles.profileInfo}>
                    <Text
                      style={[
                        styles.profileName,
                        { color: colors.text.primary },
                      ]}
                    >
                      {user?.name || "Taddle User"}
                    </Text>
                    <Text
                      style={[
                        styles.profileHandle,
                        { color: colors.primaryLight },
                      ]}
                    >
                      @{user?.username || "user"}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    padding: 8,
                    marginLeft: 4,
                    backgroundColor: "rgba(124,58,237,0.1)",
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: "rgba(124,58,237,0.2)",
                    position: "relative",
                  }}
                  onPress={() => setAccountsExpanded(!accountsExpanded)}
                  activeOpacity={0.6}
                >
                  <Ionicons
                    name={accountsExpanded ? "chevron-up" : "swap-horizontal"}
                    size={18}
                    color={colors.primaryLight}
                  />
                  {hasInactiveUnread && (
                    <View
                      style={{
                        position: "absolute",
                        top: -2,
                        right: -2,
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: colors.danger,
                        borderWidth: 1.5,
                        borderColor: colors.bg.surface,
                      }}
                    />
                  )}
                </TouchableOpacity>
              </View>

              {/* ── Account Switcher Dropdown ── */}
              {accountsExpanded && (
                <View
                  style={[
                    styles.expandedAccountsWrapper,
                    {
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.03)"
                        : "rgba(0,0,0,0.03)",
                    },
                  ]}
                >
                  {otherAccounts.map((account) => (
                    <TouchableOpacity
                      key={String(account.userId)}
                      style={styles.expandedAccountRow}
                      activeOpacity={0.7}
                      onPress={() => {
                        onClose();
                        setTimeout(
                          () => switchAccount(account.userId),
                          CLOSE_DELAY,
                        );
                      }}
                    >
                      <View style={{ position: "relative" }}>
                        <View style={styles.expandedAvatarRing}>
                          {account.avatarUrl ? (
                            <Image
                              source={{ uri: account.avatarUrl }}
                              style={styles.avatarImage}
                            />
                          ) : (
                            <View
                              style={[
                                styles.avatarFallback,
                                { backgroundColor: colors.bg.card },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.avatarInitial,
                                  { color: colors.text.primary },
                                ]}
                              >
                                {(account.name || "U").charAt(0).toUpperCase()}
                              </Text>
                            </View>
                          )}
                        </View>
                        {inactiveUnreadStatus[String(account.userId)] && (
                          <View
                            style={{
                              position: "absolute",
                              top: -2,
                              right: -2,
                              width: 10,
                              height: 10,
                              borderRadius: 5,
                              backgroundColor: colors.danger,
                              borderWidth: 1.5,
                              borderColor: colors.bg.surface,
                            }}
                          />
                        )}
                      </View>
                      <View style={{ flex: 1, justifyContent: "center" }}>
                        <Text
                          numberOfLines={1}
                          style={{
                            color: colors.text.primary,
                            fontSize: 13,
                            fontWeight: "600",
                          }}
                        >
                          {account.name || account.username}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={{
                            color: colors.text.muted,
                            fontSize: 11,
                            marginTop: 1,
                          }}
                        >
                          @{account.username}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.expandedRemoveBtn}
                        onPress={() => removeAccountFromDevice(account.userId)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name="close-circle"
                          size={18}
                          color={colors.text.muted}
                        />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}

                  <TouchableOpacity
                    style={[styles.expandedAddRow, { marginTop: 4 }]}
                    activeOpacity={0.7}
                    onPress={() => {
                      onClose();
                      setTimeout(() => goToAddAccount(), CLOSE_DELAY);
                    }}
                  >
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        borderWidth: 1.5,
                        borderStyle: "dashed",
                        borderColor: isDark
                          ? "rgba(124,58,237,0.5)"
                          : "rgba(124,58,237,0.4)",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons
                        name="add"
                        size={16}
                        color={colors.primaryLight}
                      />
                    </View>
                    <Text
                      style={[
                        styles.expandedAccountName,
                        {
                          color: colors.primaryLight,
                          fontWeight: "600",
                          fontSize: fontSizes.sm - 1,
                        },
                      ]}
                    >
                      Add Account
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={{ paddingBottom: spacing.sm }}>
              <XPProgressBar
                level={level}
                rank={rank}
                currentXP={totalXP}
                targetXP={Math.floor(totalXP / 1000 + 1) * 1000}
                onPress={() => setLevelInfoVisible(true)}
              />
            </View>

            {/* ── Messages Button ── */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => go("/chat")}
              style={{ marginHorizontal: spacing.lg, marginBottom: spacing.sm }}
            >
              <View
                style={{
                  borderRadius: radii.md,
                  borderWidth: 1,
                  borderColor: isDark
                    ? "rgba(124,58,237,0.3)"
                    : "rgba(124,58,237,0.4)",
                  backgroundColor: isDark
                    ? "rgba(124,58,237,0.1)"
                    : "rgba(124,58,237,0.08)",
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: colors.primary,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                  }}
                >
                  <Ionicons name="chatbubbles" size={16} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: fontSizes.sm,
                      fontWeight: "700",
                      color: colors.primaryLight,
                    }}
                  >
                    Messages
                  </Text>
                  <Text
                    style={{
                      fontSize: fontSizes.xs - 1,
                      color: colors.text.secondary,
                      marginTop: 2,
                    }}
                  >
                    Taddle with mutuals & communities
                  </Text>
                </View>
                {unreadChatCount > 0 && (
                  <View
                    style={{
                      backgroundColor: colors.danger,
                      borderRadius: 12,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      marginRight: 10,
                    }}
                  >
                    <Text
                      style={{
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: "bold",
                      }}
                    >
                      {unreadChatCount > 99 ? "99+" : unreadChatCount}
                    </Text>
                  </View>
                )}
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: isDark
                      ? "rgba(124,58,237,0.15)"
                      : "rgba(124,58,237,0.2)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={colors.primaryLight}
                  />
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => go("/leaderboards")}
              style={{ marginHorizontal: spacing.lg, marginBottom: spacing.sm }}
            >
              <LinearGradient
                colors={
                  isDark
                    ? ["rgba(251,191,36,0.12)", "rgba(245,158,11,0.03)"]
                    : ["rgba(251,191,36,0.15)", "rgba(245,158,11,0.05)"]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: radii.md,
                  borderWidth: 1,
                  borderColor: isDark
                    ? "rgba(251,191,36,0.25)"
                    : "rgba(251,191,36,0.4)",
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <LinearGradient
                  colors={["#FBBF24", "#D97706"]}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                  }}
                >
                  <Ionicons name="trophy" size={16} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: fontSizes.sm,
                      fontWeight: "800",
                      color: isDark ? "#FBBF24" : "#B45309",
                    }}
                  >
                    Weekly Leaderboards
                  </Text>
                  <Text
                    style={{
                      fontSize: fontSizes.xs - 1,
                      fontWeight: "600",
                      color: colors.text.secondary,
                      marginTop: 1,
                    }}
                  >
                    Rise the ranks & win rewards
                  </Text>
                </View>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: isDark
                      ? "rgba(251,191,36,0.15)"
                      : "rgba(251,191,36,0.2)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={isDark ? "#FBBF24" : "#B45309"}
                  />
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
            />

            {mainMenu.map((row) => (
              <DrawerRow key={row.label} colors={colors} {...row} />
            ))}

            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
            />

            {moreMenu.map((row) => (
              <DrawerRow key={row.label} colors={colors} {...row} />
            ))}

            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
            />

            <View style={styles.footer}>
              <Text style={[styles.footerApp, { color: colors.text.muted }]}>
                TADDLEBOX
              </Text>
              <Text
                style={[styles.footerVersion, { color: colors.text.muted }]}
              >
                {appVersionLabel}
              </Text>
            </View>

            <View style={{ height: insets.bottom + 24 }} />
          </ScrollView>
        </Animated.View>
      </View>

      <LevelInfoModal
        visible={levelInfoVisible}
        onClose={() => setLevelInfoVisible(false)}
        level={level}
        rank={rank}
        currentXP={totalXP}
      />
    </Modal>
  );
}

// ── sub-components ───────────────────────────────────────────────────────────

function StatBox({
  value,
  label,
  colors,
}: {
  value: string;
  label: string;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statVal, { color: colors.text.primary }]}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.text.muted }]}>
        {label}
      </Text>
    </View>
  );
}

function DrawerRow({
  icon,
  label,
  badge,
  subtitle,
  onPress,
  purple,
  colors,
}: MenuRow & { colors: ReturnType<typeof useThemeColors> }) {
  return (
    <TouchableOpacity
      style={styles.menuRow}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.menuIconWrap,
          {
            backgroundColor: purple ? "rgba(124,58,237,0.14)" : colors.bg.card,
          },
          purple && { borderWidth: 1, borderColor: "rgba(124,58,237,0.25)" },
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={purple ? colors.primaryLight : colors.text.secondary}
        />
      </View>
      <View style={styles.menuLabelWrap}>
        <Text
          style={[
            styles.menuLabel,
            { color: purple ? colors.text.primary : colors.text.secondary },
          ]}
        >
          {label}
        </Text>
        {subtitle !== undefined && (
          <Text
            numberOfLines={1}
            style={[styles.menuSubtitle, { color: colors.text.muted }]}
          >
            {subtitle}
          </Text>
        )}
      </View>
      {badge !== undefined && (
        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      <Ionicons
        name="chevron-forward"
        size={15}
        color={colors.text.muted}
        style={{ marginLeft: "auto" }}
      />
    </TouchableOpacity>
  );
}

// ── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  modalRoot: {
    flex: 1,
  },
  dismissZone: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    // width is set inline via left: DRAWER_W so it covers everything to the right of the panel
  },
  panel: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_W,
    borderRightWidth: 1,
  },
  profileContainer: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: { fontSize: 30 },
  profileInfo: { flex: 1 },
  profileName: { fontSize: fontSizes.md, fontWeight: "800" },
  profileHandle: { fontSize: fontSizes.sm, marginTop: 2 },
  profileCollege: { fontSize: fontSizes.xs, marginTop: 2 },
  statsStrip: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
  },
  statBox: { flex: 1, alignItems: "center", paddingVertical: 4 },
  statDiv: { width: 1, marginVertical: 4 },
  statVal: { fontSize: fontSizes.md, fontWeight: "800" },
  statLabel: { fontSize: fontSizes.xs, marginTop: 2 },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: 10,
  },
  rankBadge: {
    borderRadius: radii.full,
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  rankBadgeText: { fontSize: fontSizes.xs, fontWeight: "700" },
  rankXP: { fontSize: fontSizes.xs },
  divider: { height: 1, marginVertical: spacing.xs },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    gap: 14,
  },
  menuIconWrap: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabelWrap: { flex: 1, gap: 1 },
  menuLabel: { fontSize: fontSizes.md, fontWeight: "600" },
  menuSubtitle: { fontSize: fontSizes.xs },
  badge: { borderRadius: radii.full, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: fontSizes.xs, color: "#fff", fontWeight: "700" },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    alignItems: "center",
  },
  footerApp: { fontSize: fontSizes.sm, fontWeight: "800", letterSpacing: 1 },
  footerVersion: { fontSize: fontSizes.xs, marginTop: 4 },

  expandedAccountsWrapper: {
    marginTop: spacing.sm,
    borderRadius: radii.md,
    padding: 8,
    gap: 8,
  },
  expandedAccountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
  },
  expandedAvatarRing: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: fontSizes.sm,
    fontWeight: "700",
  },
  expandedAccountName: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontWeight: "600",
  },
  expandedRemoveBtn: {
    padding: 4,
  },
  expandedAddRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  expandedAddRing: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderStyle: "dashed",
  },
});
