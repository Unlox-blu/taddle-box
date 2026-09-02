import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import type { FeedCtx, ContentItem, EventData } from "../content";

export default function EventCard({ item, ctx }: { item: ContentItem; ctx: FeedCtx }) {
  const data = item.data;
  return (
    <TouchableOpacity style={ctx.styles.peopleRow} onPress={() => ctx.openEvents(data.id)} activeOpacity={0.8}>
      <View style={[ctx.styles.avatarBubble, { backgroundColor: ctx.colors.xpOrange + "20", borderRadius: 8 }]}>
        {data.cover_image_url ? (
          <Image source={{ uri: data.cover_image_url }} style={[ctx.styles.avatarImg, { borderRadius: 8 }]} contentFit="cover" />
        ) : (
          <Text style={{ fontSize: 18 }}>📅</Text>
        )}
      </View>
      <View style={ctx.styles.peopleInfo}>
        <Text style={[ctx.styles.peopleName, { color: ctx.colors.text.primary }]} numberOfLines={1}>
          {data.title}
        </Text>
        <Text style={[ctx.styles.peopleMeta, { color: ctx.colors.text.muted }]} numberOfLines={1}>
          {data.description || "Upcoming Event"}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
