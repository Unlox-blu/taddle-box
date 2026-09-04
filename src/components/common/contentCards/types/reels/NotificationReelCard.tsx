/**
 * NotificationReelCard — Full-screen reel for notification content.
 * Dark immersive card showing notification with actor, action, and tap to navigate.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import type { ContentItem } from "../../content";
import type { ReelCtx } from "../../../SharedReels";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const NOTIF_ICONS: Record<string, string> = {
  like: "heart",
  comment: "chatbubble",
  follow: "person-add",
  mention: "at",
  event: "calendar",
  achievement: "trophy",
  game_invite: "game-controller",
  post: "create",
  community: "people",
  streak: "flame",
};

const NOTIF_COLORS: Record<string, string> = {
  like: "#F472B6",
  comment: "#A78BFA",
  follow: "#22D3EE",
  mention: "#67E8F9",
  event: "#FBBF24",
  achievement: "#FBBF24",
  game_invite: "#A78BFA",
  post: "#7C3AED",
  community: "#22D3EE",
  streak: "#FBBF24",
};

export default function NotificationReelCard({
  item,
  ctx,
}: {
  item: ContentItem;
  ctx: ReelCtx;
}) {
  const notif = item.data;
  const iconName = (NOTIF_ICONS[notif.type] || "notifications") as any;
  const accentColor = NOTIF_COLORS[notif.type] || "#7C3AED";

  const handlePress = () => {
    if (notif.type === "follow" && notif.payload?.username) {
      ctx.openUser({
        username: notif.payload.username,
        name: notif.actor,
        avatarUrl: notif.avatarUrl,
      });
    } else if (notif.type === "community") {
      ctx.openCommunity(notif.payload?.communitySlug || notif.resourceId || "");
    } else if (notif.type === "event") {
      ctx.openEvents();
    } else if (notif.type === "game_invite") {
      ctx.openGames();
    } else if (notif.resourceId) {
      ctx.openPost({ id: notif.resourceId });
    }
  };

  return (
    <View style={styles.container}>
      {/* Avatar + icon */}
      <View style={styles.avatarWrap}>
        {notif.avatarUrl ? (
          <Image
            source={{ uri: notif.avatarUrl }}
            style={styles.avatar}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Ionicons name="person" size={32} color="rgba(255,255,255,0.3)" />
          </View>
        )}
        <View style={[styles.iconDot, { backgroundColor: accentColor }]}>
          <Ionicons name={iconName} size={12} color="#fff" />
        </View>
      </View>

      {/* Actor */}
      <Text style={styles.actor} numberOfLines={1}>
        {notif.actor || notif.title || "Notification"}
      </Text>

      {/* Text */}
      <Text style={styles.text} numberOfLines={3}>
        {notif.text || notif.message}
      </Text>

      {/* Time */}
      {notif.time ? (
        <Text style={styles.time}>{notif.time}</Text>
      ) : null}

      {/* Tap to view */}
      <TouchableOpacity
        style={[styles.ctaButton, { backgroundColor: accentColor }]}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <Ionicons name="arrow-forward" size={18} color="#fff" />
        <Text style={styles.ctaText}>View</Text>
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
    position: "relative",
    marginBottom: 24,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconDot: {
    position: "absolute",
    bottom: 0,
    right: -4,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#000",
  },
  actor: {
    fontSize: 24,
    fontWeight: "800",
    color: "#F1F5F9",
    textAlign: "center",
  },
  text: {
    fontSize: 16,
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 22,
    maxWidth: 280,
  },
  time: {
    fontSize: 13,
    color: "rgba(255,255,255,0.4)",
    marginTop: 12,
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 50,
    marginTop: 32,
  },
  ctaText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
