/**
 * UnknownReelCard — Full-screen fallback for unrecognized reel content types.
 * Tries to display whatever data is available, or shows a placeholder.
 */
import React from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import type { ContentItem } from "../../content";
import type { ReelCtx } from "../../../SharedReels";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export default function UnknownReelCard({
  item,
  ctx,
}: {
  item: ContentItem;
  ctx: ReelCtx;
}) {
  const data = item?.data || item || {};

  const title =
    data.title ||
    data.name ||
    data.header ||
    data.subject ||
    data.username ||
    data.slug ||
    item.itemType;
  const description =
    data.content ||
    data.description ||
    data.text ||
    data.message ||
    data.body ||
    data.summary ||
    data.bio;
  const image =
    data.imageUrl ||
    data.cover_image_url ||
    data.thumbnail ||
    data.avatarUrl ||
    data.image ||
    (Array.isArray(data.media) && data.media[0]?.cloudfront_url) ||
    data.senderAvatarUrl;

  return (
    <View style={styles.container}>
      {image ? (
        <Image
          source={{ uri: image }}
          style={styles.image}
          contentFit="cover"
        />
      ) : (
        <Ionicons
          name="help-circle-outline"
          size={64}
          color="rgba(255,255,255,0.15)"
        />
      )}

      {title ? (
        <Text style={styles.title} numberOfLines={3}>
          {String(title)}
        </Text>
      ) : null}

      {description ? (
        <Text style={styles.description} numberOfLines={5}>
          {String(description)}
        </Text>
      ) : null}

      {!title && !description && !image ? (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderType}>{item.itemType}</Text>
          <Text style={styles.placeholderHint}>
            No preview available in Reels
          </Text>
        </View>
      ) : null}
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
  image: {
    width: 200,
    height: 200,
    borderRadius: 16,
    marginBottom: 24,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#F1F5F9",
    textAlign: "center",
  },
  description: {
    fontSize: 16,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 22,
    maxWidth: 300,
  },
  placeholder: {
    alignItems: "center",
    gap: 8,
  },
  placeholderType: {
    fontSize: 16,
    color: "rgba(255,255,255,0.35)",
    fontFamily: "monospace",
  },
  placeholderHint: {
    fontSize: 14,
    color: "rgba(255,255,255,0.25)",
  },
});
