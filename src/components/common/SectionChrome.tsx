import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import { fontSizes, spacing, radii } from "../../theme";
import { useThemeColors } from "../../context/ThemeContext";
import {
  useGlobalScroll,
  applySectionScrollOffset,
  SCROLL_SHOW_SPRING,
} from "../../context/ScrollContext";

/** A right-side action button in a SectionHeader (e.g. calendar, trophy). */
export interface SectionAction {
  icon: string;
  onPress?: () => void;
}

/** A horizontal pill in a SectionHeader (e.g. category chips, tab pills). */
export interface SectionPill {
  key: string;
  label: string;
  icon?: string;
  active: boolean;
  onPress: () => void;
}

/**
 * Reusable section chrome — the title + subtitle + action icons + horizontal
 * pills row that the Communities/Events/Games screens (and Bookmarks/Wallet/
 * Settings headings) render as their pinned section header. One component so
 * every screen's section chrome looks and behaves identically.
 */
export function SectionHeader({
  title,
  subtitle,
  actions = [],
  pills = [],
}: {
  title: string;
  subtitle?: string;
  actions?: SectionAction[];
  pills?: SectionPill[];
}) {
  const colors = useThemeColors();
  return (
    <>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text.primary }]}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.text.muted }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {actions.length > 0 && (
          <View style={styles.actions}>
            {actions.map((a, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.iconButton, { backgroundColor: colors.bg.card, borderColor: colors.border }]}
                onPress={a.onPress}
                activeOpacity={0.7}
              >
                <Ionicons name={a.icon as any} size={20} color={colors.text.secondary} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      {pills.length > 0 && (
        <View style={[styles.pillsWrap, { backgroundColor: colors.bg.base }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pills}
          >
            {pills.map((p) => (
              <TouchableOpacity
                key={p.key}
                style={[
                  styles.pill,
                  { backgroundColor: colors.bg.card, borderColor: colors.border },
                  p.active && [
                    styles.pillActive,
                    { borderColor: colors.primary, backgroundColor: "rgba(124,58,237,0.15)" },
                  ],
                ]}
                onPress={p.onPress}
                activeOpacity={0.7}
              >
                {p.icon ? (
                  <Ionicons
                    name={p.icon as any}
                    size={14}
                    color={p.active ? colors.primaryLight : colors.text.muted}
                    style={{ marginRight: 4 }}
                  />
                ) : null}
                <Text
                  style={[
                    styles.pillText,
                    { color: colors.text.muted },
                    p.active && [styles.pillTextActive, { color: colors.primaryLight }],
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </>
  );
}

/**
 * Pinned section chrome for screens that use a PLAIN ScrollView (Wallet,
 * Settings) instead of PullToRefreshWrapper. Mirrors the wrapper's
 * `sectionHeader` behavior: the block sits pinned below the main header and
 * hides/shows IN LOCKSTEP with it (same direction-driven springs).
 *
 * Usage:
 *   const section = useSectionChrome(76);
 *   ...
 *   <ScrollView
 *     onScroll={(e) => { handleGlobalScroll(e); section.handleScroll(e); }}
 *     contentContainerStyle={{ paddingTop: headerHeight + section.sectionH }}
 *   >
 *   <SectionChrome sectionY={section.sectionY} setSectionH={section.setSectionH}>
 *     {heading}
 *   </SectionChrome>
 */
export function useSectionChrome(estimateH = 0) {
  const { headerHeight } = useGlobalScroll();
  const [sectionH, setSectionH] = useState(estimateH);
  const sectionY = useSharedValue(0);
  const prevY = useSharedValue(0);
  const isFocused = useIsFocused();

  // The section chrome is per-screen (unlike the GLOBAL header), so it isn't
  // reset by MainHeader's focus effect — snap it back to visible whenever this
  // screen regains focus, so it never stays hidden under a fresh header.
  useEffect(() => {
    if (isFocused) {
      sectionY.value = withSpring(0, SCROLL_SHOW_SPRING);
    }
  }, [isFocused, sectionY]);

  const handleScroll = useCallback(
    (e: any) => {
      const y = e.nativeEvent.contentOffset.y;
      applySectionScrollOffset(y, prevY.value, sectionY, headerHeight + sectionH);
      prevY.value = y;
    },
    [headerHeight, sectionY, sectionH, prevY],
  );

  return { sectionY, sectionH, setSectionH, handleScroll };
}

export default function SectionChrome({
  sectionY,
  setSectionH,
  children,
  topOffset,
}: {
  sectionY: SharedValue<number>;
  setSectionH: (h: number) => void;
  children: React.ReactNode;
  /** Where the pinned block starts from the wrapper's top. Defaults to the
      global MainHeader height; pushed screens with their own chrome pass 0. */
  topOffset?: number;
}) {
  const colors = useThemeColors();
  const { headerHeight } = useGlobalScroll();

  const sectionStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sectionY.value }],
  }));

  return (
    <Animated.View
      onLayout={(e) => setSectionH(Math.round(e.nativeEvent.layout.height))}
      style={[
        {
          position: "absolute",
          top: topOffset ?? headerHeight,
          left: 0,
          right: 0,
          zIndex: 50,
          backgroundColor: colors.bg.base,
        },
        sectionStyle,
      ]}
      pointerEvents="box-none"
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: fontSizes.xxl,
    fontWeight: "900",
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: fontSizes.sm,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pillsWrap: {
    paddingVertical: 16,
  },
  pills: {
    paddingHorizontal: spacing.xl,
    gap: 12,
  },
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  pillActive: {
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  pillText: {
    fontSize: fontSizes.sm,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  pillTextActive: {
    fontWeight: "800",
  },
});
