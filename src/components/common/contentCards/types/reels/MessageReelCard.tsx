/**
 * MessageReelCard — Full-screen reel for message search content.
 * Dark immersive card showing a message with sender and content.
 */
import React from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ContentItem } from "../../content";
import type { ReelCtx } from "../../../SharedReels";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export default function MessageReelCard({
  item,
}: {
  item: ContentItem;
  ctx: ReelCtx;
}) {
  const data = item.data;

  const senderName =
    data.author?.name || data.sender?.name || data.senderName || "Unknown";
  const content = data.content || data.message || data.text || "";
  const conversationName =
    data.conversationName || data.community?.name || "";

  return (
    <View style={styles.container}>
      {/* Message icon */}
      <View style={styles.iconWrap}>
        <Ionicons name="chatbubbles" size={48} color="rgba(59,130,246,0.4)" />
      </View>

      {/* Conversation name */}
      {conversationName ? (
        <Text style={styles.conversationName} numberOfLines={1}>
          {conversationName}
        </Text>
      ) : null}

      {/* Sender */}
      <Text style={styles.senderLabel}>
        <Text style={styles.senderName}>{senderName}</Text>
      </Text>

      {/* Message content */}
      <View style={styles.messageBox}>
        <Text style={styles.messageText} numberOfLines={6}>
          {item.highlight?.content || content}
        </Text>
      </View>
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
  conversationName: {
    fontSize: 13,
    color: "rgba(255,255,255,0.45)",
    marginBottom: 8,
    fontStyle: "italic",
  },
  senderLabel: {
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
    marginBottom: 16,
  },
  senderName: {
    fontWeight: "700",
    color: "#F1F5F9",
  },
  messageBox: {
    backgroundColor: "rgba(59,130,246,0.1)",
    borderLeftWidth: 3,
    borderLeftColor: "#3B82F6",
    padding: 20,
    borderRadius: 12,
    maxWidth: 320,
    width: "100%",
  },
  messageText: {
    fontSize: 16,
    color: "rgba(255,255,255,0.85)",
    lineHeight: 24,
  },
});
