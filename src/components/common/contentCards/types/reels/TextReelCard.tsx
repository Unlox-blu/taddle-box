/**
 * TextReelCard — Full-screen reel for text/hashtag content.
 * Dark immersive card showing the text prominently.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import type { ContentItem } from "../../content";
import type { ReelCtx } from "../../../SharedReels";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export default function TextReelCard({
  item,
  ctx,
}: {
  item: ContentItem;
  ctx: ReelCtx;
}) {
  const data = item.data;

  return (
    <View style={styles.container}>
      <View style={styles.hashBadge}>
        <Feather name="hash" size={44} color="#F59E0B" />
      </View>
      <Text style={styles.text} numberOfLines={4}>
        {data.text}
      </Text>
      <TouchableOpacity
        style={styles.ctaButton}
        onPress={() => {
          /* hashtag navigation handled by caller if needed */
        }}
        activeOpacity={0.8}
      >
        <Ionicons name="search" size={18} color="#fff" />
        <Text style={styles.ctaText}>Explore</Text>
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
  hashBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderWidth: 1.5,
    borderColor: "rgba(245, 158, 11, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontSize: 32,
    fontWeight: "900",
    color: "#F1F5F9",
    textAlign: "center",
    marginTop: 20,
    marginBottom: 32,
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(245,158,11,0.2)",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
  },
  ctaText: {
    color: "#F59E0B",
    fontSize: 16,
    fontWeight: "700",
  },
});
