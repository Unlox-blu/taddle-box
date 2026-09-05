/**
 * EventReelCard — Full-screen reel for event content.
 * Dark immersive card with cover image, title, description, and RSVP tap.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import type { ContentItem } from "../../content";
import type { ReelCtx } from "../../../SharedReels";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export default function EventReelCard({
  item,
  ctx,
}: {
  item: ContentItem;
  ctx: ReelCtx;
}) {
  const data = item.data || {};
  const coverUrl = data.cover_image_url || data.coverImageUrl || data.banner || data.imageUrl;
  const logoUrl = data.logoUrl || data.logo || data.organizerAvatar || data.community?.avatarUrl;
  const eventId = data.id || item.id;

  return (
    <View style={styles.container}>
      {/* Cover Image (Banner) */}
      {coverUrl ? (
        <Image
          source={{ uri: coverUrl }}
          style={styles.coverImage}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.coverImage, styles.coverFallback]}>
          <Ionicons name="calendar" size={64} color="rgba(255,255,255,0.15)" />
        </View>
      )}

      {/* Gradient overlay */}
      <View style={styles.gradientOverlay} />

      {/* Content */}
      <View style={styles.content}>
        {/* Event Logo / Icon */}
        <View style={styles.logoWrap}>
          {logoUrl ? (
            <Image
              source={{ uri: logoUrl }}
              style={styles.logo}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.logo, styles.logoFallback]}>
              <Ionicons name="calendar" size={30} color="#F59E0B" />
            </View>
          )}
        </View>

        <View style={styles.badge}>
          <Ionicons name="calendar" size={14} color="#F59E0B" />
          <Text style={styles.badgeText}>EVENT</Text>
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {data.title}
        </Text>

        {data.description ? (
          <Text style={styles.description} numberOfLines={3}>
            {data.description}
          </Text>
        ) : null}

        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => ctx.openEvents(eventId, data)}
          activeOpacity={0.8}
        >
          <Ionicons name="calendar-outline" size={18} color="#fff" />
          <Text style={styles.ctaText}>View Event</Text>
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
  coverImage: {
    ...StyleSheet.absoluteFill,
    width: SCREEN_W,
    height: SCREEN_H,
  },
  coverFallback: {
    backgroundColor: "rgba(245,158,11,0.08)",
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
    backgroundColor: "rgba(245,158,11,0.2)",
    borderWidth: 1.5,
    borderColor: "rgba(245,158,11,0.4)",
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
    backgroundColor: "rgba(245,158,11,0.15)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  badgeText: {
    color: "#F59E0B",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  title: {
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
    backgroundColor: "#F59E0B",
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
