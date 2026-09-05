/**
 * PersonReelCard — Full-screen reel for person/profile content.
 * Dark immersive card with avatar, name, username, followers, and profile tap.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import type { ContentItem } from "../../content";
import type { ReelCtx } from "../../../SharedReels";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export default function PersonReelCard({
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
      {/* Background Banner Image */}
      {bannerUrl ? (
        <Image
          source={{ uri: bannerUrl }}
          style={styles.backgroundImage}
          contentFit="cover"
          transition={200}
        />
      ) : null}

      {/* Dark overlay for contrast */}
      <View
        style={[
          styles.gradientOverlay,
          bannerUrl ? styles.bannerOverlay : null,
        ]}
      />

      {/* Avatar (Logo) */}
      <View style={styles.avatarWrap}>
        {data.avatarUrl ? (
          <Image
            source={{ uri: data.avatarUrl }}
            style={styles.avatar}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={{ fontSize: 48 }}>👾</Text>
          </View>
        )}
      </View>

      {/* Name */}
      <Text style={styles.name} numberOfLines={1}>
        {data.name}
      </Text>

      {/* Username */}
      <Text style={styles.username}>@{data.username}</Text>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{data.followerCount ?? 0}</Text>
          <Text style={styles.statLabel}>Followers</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{data.followingCount ?? 0}</Text>
          <Text style={styles.statLabel}>Following</Text>
        </View>
      </View>

      {/* View Profile button */}
      <TouchableOpacity
        style={styles.ctaButton}
        onPress={() => ctx.openUser(data)}
        activeOpacity={0.8}
      >
        <Ionicons name="person-outline" size={18} color="#fff" />
        <Text style={styles.ctaText}>View Profile</Text>
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
    backgroundColor: "transparent",
  },
  bannerOverlay: {
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  avatarWrap: {
    marginBottom: 20,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(124,58,237,0.3)",
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
  },
  username: {
    fontSize: 16,
    color: "rgba(255,255,255,0.55)",
    marginTop: 4,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    marginTop: 24,
    marginBottom: 32,
  },
  stat: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#F1F5F9",
  },
  statLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#7C3AED",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 50,
  },
  ctaText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
