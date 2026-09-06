import React, { useMemo } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StyleSheet,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { fontSizes, spacing, radii, type ColorPalette } from "../../theme";

const { height: SH } = Dimensions.get("window");

export interface AchievementBadge {
  id: string;
  name: string;
  desc: string;
  criteria: string;
  reward: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  border: string;
  isUnlocked: boolean;
}

interface AchievementInfoModalProps {
  visible: boolean;
  onClose: () => void;
  selectedBadgeId?: string | null;
  userBadges?: any[];
  userStats?: {
    totalXp?: number;
    level?: number;
    postCount?: number;
    followerCount?: number;
    followingCount?: number;
  };
}

function getBadgeIconName(name: string = "", emoji: string = ""): keyof typeof Ionicons.glyphMap {
  const n = name.toLowerCase();
  if (n.includes("active") || emoji === "🔥" || n.includes("fire")) return "flame";
  if (n.includes("creator") || n.includes("post") || emoji === "📝" || emoji === "🎨") return "sparkles";
  if (n.includes("game") || n.includes("champion") || emoji === "🎮") return "game-controller";
  if (n.includes("pro") || n.includes("master") || emoji === "🏆") return "trophy";
  if (n.includes("social") || n.includes("popular") || emoji === "👥" || emoji === "💬") return "people";
  if (n.includes("streak") || n.includes("xp") || emoji === "⚡") return "flash";
  if (n.includes("guild") || n.includes("community") || emoji === "🛡️") return "shield-checkmark";
  return "medal";
}

function getBadgeThemeColor(colorKey?: string): string {
  if (colorKey === "gold") return "#F59E0B";
  if (colorKey === "cyan") return "#06B6D4";
  if (colorKey === "green") return "#10B981";
  if (colorKey === "blue") return "#3B82F6";
  return "#A855F7";
}

export default function AchievementInfoModal({
  visible,
  onClose,
  selectedBadgeId,
  userBadges,
  userStats,
}: AchievementInfoModalProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const totalXp = userStats?.totalXp ?? 0;
  const postCount = userStats?.postCount ?? 0;
  const level = userStats?.level ?? 1;
  const connections = (userStats?.followerCount ?? 0) + (userStats?.followingCount ?? 0);

  const defaultAchievements: any[] = [
    {
      id: "b1",
      name: "Early Creator",
      desc: "Create and publish your original posts or reels on TaddleBox.",
      criteria: "Post 1+ items",
      reward: "+100 XP Bonus",
      emoji: "🎨",
      color: "purple",
      isUnlocked: postCount > 0,
    },
    {
      id: "b2",
      name: "XP Pioneer",
      desc: "Earn 500+ cumulative XP by logging in, posting, and interacting.",
      criteria: "Accumulate 500+ total XP",
      reward: "+250 XP Bonus",
      emoji: "🔥",
      color: "gold",
      isUnlocked: totalXp >= 500,
    },
    {
      id: "b3",
      name: "Community Star",
      desc: "Build your network by following creators and gaining followers.",
      criteria: "Connect with 1+ member",
      reward: "+150 XP Bonus",
      emoji: "💬",
      color: "cyan",
      isUnlocked: connections >= 1,
    },
    {
      id: "b4",
      name: "Level Master",
      desc: "Reach Level 5 to unlock intermediate creator perks and prestige.",
      criteria: "Reach Profile Level 5",
      reward: "+500 XP Bonus",
      emoji: "🏆",
      color: "gold",
      isUnlocked: level >= 5,
    },
    {
      id: "b5",
      name: "Game Challenger",
      desc: "Participate in community game matches and challenges.",
      criteria: "Play 1+ game match",
      reward: "+200 XP Bonus",
      emoji: "🎮",
      color: "green",
      isUnlocked: false,
    },
    {
      id: "b6",
      name: "Guild Member",
      desc: "Join an official TaddleBox community group.",
      criteria: "Join 1+ community",
      reward: "+150 XP Bonus",
      emoji: "🛡️",
      color: "cyan",
      isUnlocked: false,
    },
  ];

  const rawList = userBadges && userBadges.length > 0 ? userBadges : defaultAchievements;

  const achievements: AchievementBadge[] = rawList.map((b: any, idx: number) => {
    const colorTheme = getBadgeThemeColor(b.color);
    const isUnlocked = b.isUnlocked !== undefined ? b.isUnlocked : b.color !== "locked";
    return {
      id: b.id || `b${idx + 1}`,
      name: b.name || "Achievement",
      desc: b.desc || "Complete community challenges to earn rewards.",
      criteria: b.criteria || "Active participation",
      reward: b.reward || "+100 XP Bonus",
      icon: b.icon || getBadgeIconName(b.name, b.emoji),
      color: colorTheme,
      bg: `${colorTheme}24`,
      border: `${colorTheme}4D`,
      isUnlocked,
    };
  });

  const unlockedCount = achievements.filter((a) => a.isUnlocked).length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        {/* Tap outside sheet to dismiss */}
        <Pressable style={styles.backdrop} onPress={onClose} />

        {/* Bottom sheet panel */}
        <View style={styles.sheet}>
          {/* Handle bar */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <LinearGradient
                colors={[colors.primary, "#4C1D95"]}
                style={styles.headerIconBg}
              >
                <Ionicons name="trophy" size={18} color="#fff" />
              </LinearGradient>
              <View>
                <Text style={styles.title}>Achievements & Badges</Text>
                <Text style={styles.subtitle}>
                  {unlockedCount} of {achievements.length} Unlocked
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* Scrollable Content Container */}
          <ScrollView
            style={styles.scrollContainer}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            bounces={true}
          >
            {/* Intro banner */}
            <LinearGradient
              colors={
                isDark
                  ? ["rgba(124,58,237,0.22)", "rgba(76,29,149,0.15)"]
                  : ["rgba(124,58,237,0.12)", "rgba(76,29,149,0.06)"]
              }
              style={styles.introCard}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.introTitle}>Earn Badges & Level Up 🏆</Text>
                <Text style={styles.introDesc}>
                  Complete community challenges, create content, and stay active to unlock badges and earn bonus XP!
                </Text>
              </View>
            </LinearGradient>

            <Text style={styles.sectionHeader}>All Achievements</Text>

            <View style={styles.list}>
              {achievements.map((item) => {
                const isSelected = selectedBadgeId === item.id;
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.card,
                      isSelected && {
                        borderColor: colors.primary,
                        borderWidth: 1.5,
                      },
                      !item.isUnlocked && { opacity: 0.7 },
                    ]}
                  >
                    <View
                      style={[
                        styles.iconWrap,
                        {
                          backgroundColor: item.isUnlocked
                            ? item.bg
                            : isDark
                            ? "rgba(255,255,255,0.05)"
                            : "rgba(0,0,0,0.04)",
                          borderColor: item.isUnlocked
                            ? item.border
                            : isDark
                            ? "rgba(255,255,255,0.1)"
                            : "rgba(0,0,0,0.08)",
                        },
                      ]}
                    >
                      <Ionicons
                        name={item.icon}
                        size={22}
                        color={item.isUnlocked ? item.color : colors.text.muted}
                      />
                    </View>

                    <View style={styles.cardBody}>
                      <View style={styles.titleRow}>
                        <Text style={styles.badgeName}>{item.name}</Text>
                        <View
                          style={[
                            styles.statusTag,
                            {
                              backgroundColor: item.isUnlocked
                                ? "rgba(16,185,129,0.18)"
                                : isDark
                                ? "rgba(255,255,255,0.08)"
                                : "rgba(0,0,0,0.06)",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusTagText,
                              {
                                color: item.isUnlocked
                                  ? "#10B981"
                                  : colors.text.muted,
                              },
                            ]}
                          >
                            {item.isUnlocked ? "UNLOCKED" : "LOCKED"}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.badgeDesc}>{item.desc}</Text>

                      <View style={styles.metaRow}>
                        <Text style={styles.criteriaText}>
                          🎯 {item.criteria}
                        </Text>
                        <Text style={[styles.rewardText, { color: item.color }]}>
                          {item.reward}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          {/* Fixed Footer Button */}
          <View style={styles.footerContainer}>
            <TouchableOpacity
              style={styles.gotItBtn}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[colors.primary, "#4C1D95"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.gotItGradient}
              >
                <Text style={styles.gotItText}>Got It</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: ColorPalette, isDark: boolean) {
  return StyleSheet.create({
    modalRoot: {
      flex: 1,
      justifyContent: "flex-end",
    },
    backdrop: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.65)",
    },
    sheet: {
      height: SH * 0.8,
      backgroundColor: isDark ? "#121222" : c.bg.surface,
      borderTopLeftRadius: radii["2xl"],
      borderTopRightRadius: radii["2xl"],
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
      borderTopWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
      overflow: "hidden",
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)",
      alignSelf: "center",
      marginTop: spacing.xs,
      marginBottom: spacing.xs,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
      marginBottom: spacing.md,
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    headerIconBg: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      fontSize: fontSizes.md + 1,
      fontWeight: "800",
      color: c.text.primary,
    },
    subtitle: {
      fontSize: fontSizes.xs,
      fontWeight: "600",
      color: c.primaryLight,
      marginTop: 2,
    },
    closeBtn: {
      padding: 6,
      borderRadius: 16,
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
    },
    scrollContainer: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: spacing.xl,
    },
    introCard: {
      borderRadius: radii.xl,
      padding: spacing.md,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: isDark ? "rgba(124,58,237,0.3)" : "rgba(124,58,237,0.2)",
    },
    introTitle: {
      fontSize: fontSizes.sm + 1,
      fontWeight: "800",
      color: c.text.primary,
      marginBottom: 4,
    },
    introDesc: {
      fontSize: fontSizes.xs,
      color: c.text.secondary,
      lineHeight: 18,
    },
    sectionHeader: {
      fontSize: fontSizes.sm + 1,
      fontWeight: "800",
      color: c.text.primary,
      marginTop: spacing.xs,
      marginBottom: spacing.md,
      letterSpacing: 0.3,
    },
    list: {
      gap: spacing.md,
    },
    card: {
      flexDirection: "row",
      gap: 12,
      padding: spacing.md,
      borderRadius: radii.xl,
      backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)",
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
    },
    cardBody: {
      flex: 1,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 4,
    },
    badgeName: {
      fontSize: fontSizes.sm,
      fontWeight: "800",
      color: c.text.primary,
    },
    statusTag: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
    },
    statusTagText: {
      fontSize: 10,
      fontWeight: "800",
    },
    badgeDesc: {
      fontSize: fontSizes.xs,
      color: c.text.secondary,
      lineHeight: 16,
      marginBottom: 6,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 2,
    },
    criteriaText: {
      fontSize: fontSizes.xs - 1,
      color: c.text.muted,
      fontWeight: "600",
    },
    rewardText: {
      fontSize: fontSizes.xs - 1,
      fontWeight: "800",
    },
    footerContainer: {
      paddingVertical: spacing.md,
      borderTopWidth: 1,
      borderTopColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
      backgroundColor: isDark ? "#121222" : c.bg.surface,
    },
    gotItBtn: {
      borderRadius: radii.xl,
      overflow: "hidden",
    },
    gotItGradient: {
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    gotItText: {
      color: "#fff",
      fontWeight: "800",
      fontSize: fontSizes.md,
    },
  });
}
