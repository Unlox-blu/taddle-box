/**
 * HeaderReelCard — Full-screen reel for header content.
 * Shows title and subtitle in a full-screen format with
 * an animated swipe-down indicator so users know
 * the header is navigable by vertical swipe.
 */
import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ContentItem } from "../../content";
import type { ReelCtx } from "../../../SharedReels";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export default function HeaderReelCard({
  item,
  ctx,
}: {
  item: ContentItem;
  ctx: ReelCtx;
}) {
  const data = item.data;

  // ── Pulse animation for the swipe indicators ──────────────────────────
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const arrowOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.85],
  });

  // Slight vertical bounce for the arrows
  const arrowBounceDown = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 5],
  });

  return (
    <View style={styles.container}>
      {/* Title & subtitle */}
      <Text style={styles.title} numberOfLines={3}>
        {data.title}
      </Text>
      {data.subtitle ? (
        <Text style={styles.subtitle} numberOfLines={2}>
          {data.subtitle}
        </Text>
      ) : null}

      {/* Swipe-down indicator (bottom) */}
      <Animated.View
        style={[
          styles.arrowWrapper,
          {
            opacity: arrowOpacity,
            transform: [{ translateY: arrowBounceDown }],
          },
        ]}
      >
        <Text style={styles.arrowLabel}>Down</Text>
        <Ionicons name="chevron-down" size={28} color="#F1F5F9" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_W,
    height: SCREEN_H,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  title: {
    fontSize: 36,
    fontWeight: "900",
    color: "#F1F5F9",
    textAlign: "center",
    lineHeight: 42,
  },
  subtitle: {
    fontSize: 18,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 24,
  },
  // ── Swipe indicators ───────────────────────────────────────────────
  arrowWrapper: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    bottom: 48,
    alignSelf: "center",
  },
  arrowLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.55)",
    marginTop: 2,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
