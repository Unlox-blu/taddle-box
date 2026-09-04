/**
 * CommentReelCard — Full-screen reel for comment content.
 * Dark immersive card showing a comment with author and tap to view post.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ContentItem } from "../../content";
import type { ReelCtx } from "../../../SharedReels";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export default function CommentReelCard({
  item,
  ctx,
}: {
  item: ContentItem;
  ctx: ReelCtx;
}) {
  const data = item.data;

  return (
    <View style={styles.container}>
      {/* Comment icon */}
      <View style={styles.iconWrap}>
        <Ionicons name="chatbubble" size={48} color="rgba(124,58,237,0.4)" />
      </View>

      {/* Author */}
      <Text style={styles.authorLabel}>
        <Text style={styles.authorName}>{data.author?.name}</Text> commented on:
      </Text>

      {/* Comment content */}
      <View style={styles.commentBox}>
        <Text style={styles.commentText} numberOfLines={6}>
          {item.highlight?.content || data.content}
        </Text>
      </View>

      {/* Post title if available */}
      {data.postTitle ? (
        <Text style={styles.postTitle} numberOfLines={1}>
          on: {data.postTitle}
        </Text>
      ) : null}

      {/* View Post button */}
      <TouchableOpacity
        style={styles.ctaButton}
        onPress={() => ctx.openPost({ id: data.postId })}
        activeOpacity={0.8}
      >
        <Ionicons name="arrow-forward" size={18} color="#fff" />
        <Text style={styles.ctaText}>View Post</Text>
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
  iconWrap: {
    marginBottom: 24,
  },
  authorLabel: {
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
    marginBottom: 16,
  },
  authorName: {
    fontWeight: "700",
    color: "#F1F5F9",
  },
  commentBox: {
    backgroundColor: "rgba(124,58,237,0.1)",
    borderLeftWidth: 3,
    borderLeftColor: "#7C3AED",
    padding: 20,
    borderRadius: 12,
    maxWidth: 320,
    width: "100%",
  },
  commentText: {
    fontSize: 16,
    color: "rgba(255,255,255,0.85)",
    lineHeight: 24,
  },
  postTitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.45)",
    marginTop: 16,
    fontStyle: "italic",
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#7C3AED",
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
