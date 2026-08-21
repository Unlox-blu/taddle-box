import React, { useEffect, useRef } from "react";
import { View, Animated, Dimensions, StyleSheet } from "react-native";
import { useThemeColors } from "../../context/ThemeContext";

const SCREEN_W = Dimensions.get("window").width;
const CARD_W = SCREEN_W - 32;
const CARD_PADDING = 16;

/**
 * Shimmer skeleton for a single post card — matches PostCard's layout:
 * header (avatar + name + menu), body text lines, media block, action row.
 */
function SkeletonCard({ colors, index }: { colors: any; index: number }) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.08, 0.18],
  });

  const bg = colors.bg.card || colors.bg.surface;
  const shimmerBg = colors.text.muted || "#666";

  return (
    <View style={[s.card, { backgroundColor: bg, marginBottom: 12 }]}>
      {/* Header: avatar + name + menu */}
      <View style={s.header}>
        <Animated.View
          style={[s.avatar, { backgroundColor: shimmerBg, opacity }]}
        />
        <View style={{ flex: 1, gap: 6 }}>
          <Animated.View
            style={[s.lineShort, { backgroundColor: shimmerBg, opacity }]}
          />
          <Animated.View
            style={[s.lineTiny, { backgroundColor: shimmerBg, opacity }]}
          />
        </View>
        <Animated.View
          style={[s.menuDot, { backgroundColor: shimmerBg, opacity }]}
        />
      </View>

      {/* Body text lines */}
      <View style={s.body}>
        <Animated.View
          style={[s.lineFull, { backgroundColor: shimmerBg, opacity }]}
        />
        <Animated.View
          style={[s.lineThreeQuarter, { backgroundColor: shimmerBg, opacity }]}
        />
      </View>

      {/* Media placeholder */}
      <Animated.View
        style={[
          s.mediaBlock,
          { backgroundColor: shimmerBg, opacity: opacity, marginBottom: 10 },
        ]}
      />

      {/* Action row: heart + comment + share */}
      <View style={s.actions}>
        <Animated.View
          style={[s.actionIcon, { backgroundColor: shimmerBg, opacity }]}
        />
        <Animated.View
          style={[s.actionIcon, { backgroundColor: shimmerBg, opacity }]}
        />
        <Animated.View
          style={[s.actionIcon, { backgroundColor: shimmerBg, opacity }]}
        />
      </View>
    </View>
  );
}

/**
 * Renders a column of skeleton post cards to show while the feed loads.
 * Pass `count` to control how many placeholder cards appear (default 3).
 */
export default function FeedSkeleton({ count = 3 }: { count?: number }) {
  const colors = useThemeColors();
  return (
    <View style={s.container}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} colors={colors} index={i} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: CARD_PADDING, paddingTop: 8 },
  card: {
    borderRadius: 16,
    padding: CARD_PADDING,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, marginRight: 10 },
  menuDot: { width: 16, height: 16, borderRadius: 8 },
  body: { gap: 8, marginBottom: 12 },
  lineFull: { height: 12, borderRadius: 6, width: "100%" },
  lineThreeQuarter: { height: 12, borderRadius: 6, width: "72%" },
  lineShort: { height: 12, borderRadius: 6, width: "45%" },
  lineTiny: { height: 10, borderRadius: 5, width: "30%" },
  mediaBlock: { height: 200, borderRadius: 12, width: "100%" },
  actions: { flexDirection: "row", gap: 16 },
  actionIcon: { width: 24, height: 24, borderRadius: 12 },
});
