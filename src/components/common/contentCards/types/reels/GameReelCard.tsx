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
  const data = item.data || {};
  const bannerUrl =
    data.metadata?.cardUrl ||
    data.cardUrl ||
    data.bannerUrl ||
    data.banner ||
    data.imageUrl;
  const logoUrl =
    data.thumbnail ||
    data.logoUrl ||
    data.logo ||
    data.metadata?.thumbnail;
  const gameId = data.slug || data.id || item.id;

  return (
    <View style={styles.container}>
      {/* Game Banner (Hero Card Artwork) */}
      {bannerUrl ? (
        <Image
          source={{ uri: bannerUrl }}
          style={styles.bannerImage}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.bannerImage, styles.bannerFallback]}>
          <Ionicons name="game-controller" size={64} color="rgba(255,255,255,0.15)" />
        </View>
      )}

      {/* Gradient overlay */}
      <View style={styles.gradientOverlay} />

      {/* Content */}
      <View style={styles.content}>
        {/* Game Logo / Thumbnail */}
        <View style={styles.logoWrap}>
          {logoUrl ? (
            <Image
              source={{ uri: logoUrl }}
              style={styles.logo}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.logo, styles.logoFallback]}>
              <Ionicons name="game-controller" size={30} color="#A78BFA" />
            </View>
          )}
        </View>

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
          onPress={() => ctx.openGames(gameId)}
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
  bannerImage: {
    ...StyleSheet.absoluteFill,
    width: SCREEN_W,
    height: SCREEN_H,
  },
  bannerFallback: {
    backgroundColor: "rgba(167,139,250,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  content: {
    padding: 32,
    paddingBottom: 48,
    gap: 12,
  },
  logoWrap: {
    marginBottom: 4,
  },
  logo: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: "rgba(167,139,250,0.2)",
    borderWidth: 1.5,
    borderColor: "rgba(167,139,250,0.4)",
    overflow: "hidden",
  },
  logoFallback: {
    alignItems: "center",
    justifyContent: "center",
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
