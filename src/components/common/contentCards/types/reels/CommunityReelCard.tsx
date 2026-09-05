/**
 * CommunityReelCard — Full-screen reel for community content.
 * Immersive card with banner backdrop (or gradient fallback), community avatar,
 * name, slug, members, and join CTA. Layout mirrors PersonReelCard.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import type { ContentItem } from "../../content";
import type { ReelCtx } from "../../../SharedReels";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export default function CommunityReelCard({
  item,
  ctx,
}: {
  item: ContentItem;
  ctx: ReelCtx;
}) {
  const data = item.data;
  const bannerUrl =
    data.bannerUrl ||
    data.banner_url ||
    data.banner ||
    data.banner_media_url;

  return (
    <View style={styles.container}>
      {/* Background: real banner image OR teal gradient fallback */}
      {bannerUrl ? (
        <Image
          source={{ uri: bannerUrl }}
          style={styles.backgroundImage}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <LinearGradient
          colors={["#0c4a6e", "#0e7490", "#0891B2", "#06b6d4"]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.backgroundImage}
        />
      )}

      {/* Dark gradient overlay — stronger at top/bottom for legibility */}
      <LinearGradient
        colors={[
          "rgba(0,0,0,0.55)",
          "rgba(0,0,0,0.1)",
          "rgba(0,0,0,0.1)",
          "rgba(0,0,0,0.75)",
        ]}
        locations={[0, 0.25, 0.65, 1]}
        style={styles.gradientOverlay}
      />

      {/* Community Avatar */}
      <View style={styles.avatarWrap}>
        {data.avatarUrl ? (
          <Image
            source={{ uri: data.avatarUrl }}
            style={styles.avatar}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={{ fontSize: 52 }}>🪐</Text>
          </View>
        )}
      </View>

      {/* Community Name */}
      <Text style={styles.name} numberOfLines={1}>
        {data.name}
      </Text>

      {/* Slug */}
      <Text style={styles.slug}>c/{data.slug}</Text>

      {/* Description */}
      {data.description ? (
        <Text style={styles.description} numberOfLines={3}>
          {data.description}
        </Text>
      ) : null}

      {/* Member Count */}
      <View style={styles.memberRow}>
        <Ionicons name="people" size={16} color="rgba(255,255,255,0.65)" />
        <Text style={styles.memberCount}>{data.memberCount ?? 0} members</Text>
      </View>

      {/* View Community button */}
      <TouchableOpacity
        style={styles.ctaButton}
        onPress={() => ctx.openCommunity(data.slug)}
        activeOpacity={0.8}
      >
        <Ionicons name="enter-outline" size={18} color="#fff" />
        <Text style={styles.ctaText}>View Community</Text>
      </TouchableOpacity>
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
  backgroundImage: {
    ...StyleSheet.absoluteFill,
    width: SCREEN_W,
    height: SCREEN_H,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFill,
  },
  avatarWrap: {
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 28,
    backgroundColor: "rgba(6,182,212,0.3)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.2)",
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontSize: 28,
    fontWeight: "800",
    color: "#F1F5F9",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  slug: {
    fontSize: 16,
    color: "rgba(255,255,255,0.65)",
    marginTop: 4,
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  description: {
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    marginTop: 16,
    lineHeight: 20,
    maxWidth: 280,
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 20,
    marginBottom: 32,
  },
  memberCount: {
    fontSize: 14,
    color: "rgba(255,255,255,0.65)",
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0891B2",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 50,
    shadowColor: "#0891B2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  ctaText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
