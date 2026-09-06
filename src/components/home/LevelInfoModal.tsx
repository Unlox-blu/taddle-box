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

interface LevelInfoModalProps {
  visible: boolean;
  onClose: () => void;
  level: number;
  rank: string;
  currentXP: number;
}

export default function LevelInfoModal({
  visible,
  onClose,
  level,
  rank,
  currentXP,
}: LevelInfoModalProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const targetXP = Math.floor(currentXP / 1000 + 1) * 1000;
  const xpNeeded = Math.max(0, targetXP - currentXP);
  const pct = Math.min(Math.round((currentXP / targetXP) * 100), 100);

  const tiers = [
    {
      title: "Beginner Tier",
      badge: "🥉",
      levels: "Levels 1 – 4",
      range: "0 – 3,999 XP",
      desc: "Entry level for new creators. Start posting, interacting, and claiming daily login rewards.",
      color: "#94A3B8",
      gradient: ["rgba(148,163,184,0.15)", "rgba(148,163,184,0.04)"],
      isCurrent: level >= 1 && level <= 4,
    },
    {
      title: "Intermediate Tier",
      badge: "🥈",
      levels: "Levels 5 – 14",
      range: "4,000 – 13,999 XP",
      desc: "Active contributor. Unlocks enhanced community visibility, badges, and leaderboard rankings.",
      color: "#38BDF8",
      gradient: ["rgba(56,189,248,0.18)", "rgba(56,189,248,0.04)"],
      isCurrent: level >= 5 && level <= 14,
    },
    {
      title: "Pro Tier",
      badge: "🥇",
      levels: "Level 15+",
      range: "14,000+ XP",
      desc: "Master tier for top contributors with maximum profile prestige, exclusive perks, and rewards.",
      color: "#F59E0B",
      gradient: ["rgba(245,158,11,0.22)", "rgba(245,158,11,0.04)"],
      isCurrent: level >= 15,
    },
  ];

  const earnRules = [
    {
      icon: "calendar-outline",
      title: "Daily Login",
      reward: "Daily XP",
      desc: "Open TaddleBox daily to collect login streak rewards.",
      color: "#A855F7",
    },
    {
      icon: "create-outline",
      title: "Create Posts & Reels",
      reward: "+2 to +10 XP",
      desc: "Share text, images, video, or audio content.",
      color: "#3B82F6",
    },
    {
      icon: "people-outline",
      title: "Invite Friends",
      reward: "Bonus XP",
      desc: "Earn XP for each friend who signs up with your code.",
      color: "#10B981",
    },
    {
      icon: "trophy-outline",
      title: "Games & Tournaments",
      reward: "+10 to +50 XP",
      desc: "Play games and win community challenges.",
      color: "#F59E0B",
    },
  ];

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
                <Ionicons name="stats-chart" size={18} color="#fff" />
              </LinearGradient>
              <View>
                <Text style={styles.title}>Leveling & XP Info</Text>
                <Text style={styles.subtitle}>
                  Level {level} • {rank} Tier
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
            {/* ── Current Progress Card ── */}
            <LinearGradient
              colors={
                isDark
                  ? ["rgba(124,58,237,0.22)", "rgba(76,29,149,0.15)"]
                  : ["rgba(124,58,237,0.12)", "rgba(76,29,149,0.06)"]
              }
              style={styles.currentCard}
            >
              <View style={styles.cardHeader}>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelBadgeText}>LEVEL {level}</Text>
                </View>
                <Text style={styles.rankPill}>{rank}</Text>
              </View>

              <View style={styles.xpInfoRow}>
                <Text style={styles.totalXpText}>
                  ⚡ {currentXP.toLocaleString()} XP Earned
                </Text>
                <Text style={styles.nextXpText}>
                  {xpNeeded} XP to Level {level + 1}
                </Text>
              </View>

              {/* Progress Bar */}
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct}%` }]}>
                  <LinearGradient
                    colors={[colors.primary, colors.cyan]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ flex: 1, borderRadius: radii.full }}
                  />
                </View>
              </View>
              <Text style={styles.pctText}>{pct}% completed to next level</Text>
            </LinearGradient>

            {/* ── Level Tiers ── */}
            <Text style={styles.sectionHeader}>Level Ranks & Tiers</Text>
            <View style={styles.tiersList}>
              {tiers.map((t, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.tierCard,
                    t.isCurrent && {
                      borderColor: colors.primary,
                      borderWidth: 1.5,
                    },
                  ]}
                >
                  <LinearGradient
                    colors={t.gradient as [string, string]}
                    style={styles.tierGradient}
                  >
                    <View style={styles.tierHeader}>
                      <Text style={styles.tierBadge}>{t.badge}</Text>
                      <View style={{ flex: 1 }}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <Text style={[styles.tierTitle, { color: t.color }]}>
                            {t.title}
                          </Text>
                          {t.isCurrent && (
                            <View style={styles.currentTag}>
                              <Text style={styles.currentTagText}>
                                YOUR TIER
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.tierLevels}>
                          {t.levels} • {t.range}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.tierDesc}>{t.desc}</Text>
                  </LinearGradient>
                </View>
              ))}
            </View>

            {/* ── How to Earn XP ── */}
            <Text style={styles.sectionHeader}>How to Earn XP</Text>
            <View style={styles.rulesList}>
              {earnRules.map((rule, idx) => (
                <View key={idx} style={styles.ruleCard}>
                  <View
                    style={[
                      styles.ruleIconBox,
                      { backgroundColor: `${rule.color}20` },
                    ]}
                  >
                    <Ionicons
                      name={rule.icon as any}
                      size={18}
                      color={rule.color}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text style={styles.ruleTitle}>{rule.title}</Text>
                      <Text style={[styles.ruleReward, { color: rule.color }]}>
                        {rule.reward}
                      </Text>
                    </View>
                    <Text style={styles.ruleDesc}>{rule.desc}</Text>
                  </View>
                </View>
              ))}
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
    currentCard: {
      borderRadius: radii.xl,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: isDark ? "rgba(124,58,237,0.3)" : "rgba(124,58,237,0.2)",
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
    },
    levelBadge: {
      backgroundColor: c.primary,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: radii.full,
    },
    levelBadgeText: {
      color: "#fff",
      fontWeight: "900",
      fontSize: fontSizes.xs,
      letterSpacing: 0.5,
    },
    rankPill: {
      color: c.primaryLight,
      fontWeight: "700",
      fontSize: fontSizes.xs + 1,
    },
    xpInfoRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginVertical: spacing.xs,
    },
    totalXpText: {
      color: c.text.primary,
      fontWeight: "800",
      fontSize: fontSizes.sm + 1,
    },
    nextXpText: {
      color: c.text.secondary,
      fontWeight: "600",
      fontSize: fontSizes.xs,
    },
    track: {
      height: 8,
      backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
      borderRadius: radii.full,
      overflow: "hidden",
      marginVertical: spacing.sm,
    },
    fill: {
      height: "100%",
      borderRadius: radii.full,
    },
    pctText: {
      color: c.text.muted,
      fontSize: fontSizes.xs,
      fontWeight: "600",
      textAlign: "right",
    },
    sectionHeader: {
      fontSize: fontSizes.sm + 1,
      fontWeight: "800",
      color: c.text.primary,
      marginTop: spacing.md,
      marginBottom: spacing.md,
      letterSpacing: 0.3,
    },
    tiersList: {
      gap: spacing.md,
    },
    tierCard: {
      borderRadius: radii.xl,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
    },
    tierGradient: {
      padding: spacing.md,
    },
    tierHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 6,
    },
    tierBadge: {
      fontSize: 22,
    },
    tierTitle: {
      fontSize: fontSizes.sm + 1,
      fontWeight: "800",
    },
    currentTag: {
      backgroundColor: "rgba(124,58,237,0.25)",
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
    },
    currentTagText: {
      color: c.primaryLight,
      fontSize: 10,
      fontWeight: "800",
    },
    tierLevels: {
      fontSize: fontSizes.xs,
      fontWeight: "600",
      color: c.text.muted,
      marginTop: 1,
    },
    tierDesc: {
      fontSize: fontSizes.xs + 1,
      color: c.text.secondary,
      lineHeight: 18,
      marginTop: 4,
    },
    rulesList: {
      gap: spacing.md,
    },
    ruleCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: spacing.md,
      borderRadius: radii.xl,
      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
    },
    ruleIconBox: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
    },
    ruleTitle: {
      fontSize: fontSizes.xs + 2,
      fontWeight: "700",
      color: c.text.primary,
    },
    ruleReward: {
      fontSize: fontSizes.xs,
      fontWeight: "800",
    },
    ruleDesc: {
      fontSize: fontSizes.xs,
      color: c.text.muted,
      marginTop: 3,
      lineHeight: 16,
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
