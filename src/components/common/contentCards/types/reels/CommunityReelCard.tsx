/**
 * CommunityReelCard — Full-screen reel for community content.
 * Dark immersive card with community avatar, name, slug, members, and join tap.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { Image } from "expo-image";
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

  return (
    <View style={styles.container}>
      {/* Community Icon */}
      <View style={styles.avatarWrap}>
        {data.avatarUrl ? (
          <Image
            source={{ uri: data.avatarUrl }}
            style={styles.avatar}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={{ fontSize: 48 }}>🪐</Text>
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
        <Ionicons name="people" size={16} color="rgba(255,255,255,0.5)" />
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
  avatarWrap: {
    marginBottom: 20,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 28,
    backgroundColor: "rgba(6,182,212,0.2)",
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
  slug: {
    fontSize: 16,
    color: "rgba(255,255,255,0.55)",
    marginTop: 4,
  },
  description: {
    fontSize: 14,
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
    marginTop: 16,
    lineHeight: 20,
    maxWidth: 280,
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
    color: "rgba(255,255,255,0.5)",
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0891B2",
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
