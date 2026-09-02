/**
 * UnsupportedReelCard — Explicit fallback for unsupported reel content types.
 *
 * This card is shown when a content type doesn't have a specific reel variant.
 * During development, it makes unsupported types visible so they can be
 * intentionally handled or explicitly excluded.
 *
 * Unlike a generic fallback that silently renders, this card makes it clear
 * that the content type is not supported in the reel presentation.
 */
import React from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ContentItem } from "../../content";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

interface UnsupportedReelCardProps {
  item: ContentItem;
}

export default function UnsupportedReelCard({ item }: UnsupportedReelCardProps) {
  return (
    <View style={styles.container}>
      <Ionicons name="alert-circle-outline" size={48} color="rgba(255,255,255,0.3)" />
      <Text style={styles.title}>Unsupported content type</Text>
      <Text style={styles.type}>{item.itemType}</Text>
      <Text style={styles.hint}>This content type is not available in Reels</Text>
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
  title: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
  },
  type: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 14,
    marginTop: 8,
    fontFamily: "monospace",
  },
  hint: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 12,
    marginTop: 12,
    textAlign: "center",
  },
});
