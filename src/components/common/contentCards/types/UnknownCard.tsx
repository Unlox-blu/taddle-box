import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { FeedCtx } from "../content";

export default function UnknownCard({ item, ctx }: { item: any; ctx: FeedCtx }) {
  // Try to find the inner data object, or fall back to the outer envelope
  const data = item?.data || item || {};
  
  // Heuristics to find displayable content across common data shapes
  const title = data.title || data.name || data.header || data.subject || data.username || data.slug || data.type;
  const description = data.content || data.description || data.text || data.message || data.body || data.summary || data.bio;
  const image = data.imageUrl || data.cover_image_url || data.thumbnail || data.avatarUrl || data.image || (Array.isArray(data.media) && data.media[0]?.cloudfront_url) || data.senderAvatarUrl;

  return (
    <View style={[styles.container, { backgroundColor: ctx.colors.bg?.card || "rgba(255,255,255,0.05)", borderColor: ctx.colors.border }]}>
      
      {image ? (
        <Image source={{ uri: image }} style={styles.image} resizeMode="cover" />
      ) : null}

      <View style={styles.content}>
        {title ? (
          <Text style={[styles.title, { color: ctx.colors.text.primary }]} numberOfLines={2}>
            {String(title)}
          </Text>
        ) : null}
        
        {description ? (
          <Text style={[styles.description, { color: ctx.colors.text.secondary }]} numberOfLines={4}>
            {String(description)}
          </Text>
        ) : null}
        
        {!title && !description && !image ? (
          <View style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8 }}>
            <Text style={[styles.description, { color: ctx.colors.text.muted, fontFamily: 'monospace', fontSize: 12 }]}>
              {typeof data === 'string' ? data : JSON.stringify(data, null, 2).slice(0, 500) + (JSON.stringify(data).length > 500 ? '...' : '')}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: 180,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  content: {
    padding: 16,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  }
});
