/**
 * GameReelCard — Full-screen reel for game content.
 * Dark immersive card with thumbnail, name, description, and play tap.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import type { ContentItem } from "../../content";
import type { ReelCtx } from "../../../SharedReels";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export default function GameReelCard({
  item,
  ctx,
}: {
  item: ContentItem;
  ctx: ReelCtx;
}) {
  const data = item.data;

  return (
    <View style={styles.container}>
      {/* Thumbnail */}
      {data.thumbnail ? (
        <Image
          source={{ uri: data.thumbnail }}
          style={styles.thumbnail}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.thumbnail, styles.thumbnailFallback]}>
          <Ionicons name="game-controller" size={64} color="rgba(255,255,255,0.15)" />
        </View>
      )}

      {/* Gradient overlay */}
      <View style={styles.gradientOverlay} />

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.badge}>
          <Ionicons name="game-controller" size={14} color="#A78BFA" />
          <Text style={styles.badgeText}>GAME</Text>
        </View>

        <Text style={styles.name} numberOfLines={2}>
          {data.name}
        </Text>

        {data.description ? (
          <Text style={styles.description} numberOfLines={3}>
            {data.description}
          </Text>
        ) : null}

        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => ctx.openGames(data.id)}
          activeOpacity={0.8}
        >
          <Ionicons name="play" size={18} color="#fff" />
          <Text style={styles.ctaText}>Play Now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_W,
    height: SCREEN_H,
    backgroundColor: "#000",
    justifyContent: "flex-end",
  },
  thumbnail: {
    ...StyleSheet.absoluteFillObject,
    width: SCREEN_W,
    height: SCREEN_H,
  },
  thumbnailFallback: {
    backgroundColor: "rgba(167,139,250,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  content: {
    padding: 32,
    paddingBottom: 48,
    gap: 12,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "rgba(167,139,250,0.15)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  badgeText: {
    color: "#A78BFA",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  name: {
    fontSize: 32,
    fontWeight: "900",
    color: "#F1F5F9",
    lineHeight: 38,
  },
  description: {
    fontSize: 15,
    color: "rgba(255,255,255,0.7)",
    lineHeight: 22,
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#7C3AED",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 50,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  ctaText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
