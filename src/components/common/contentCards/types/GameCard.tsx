import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import type { FeedCtx, ContentItem, GameData } from "../content";

export default function GameCard({ item, ctx }: { item: ContentItem; ctx: FeedCtx }) {
  const data = item.data;
  return (
    <TouchableOpacity style={ctx.styles.peopleRow} onPress={() => ctx.openGames(data.id)} activeOpacity={0.8}>
      <View style={[ctx.styles.avatarBubble, { backgroundColor: ctx.colors.primaryLight + "20", borderRadius: 12 }]}>
        {data.thumbnail ? (
          <Image source={{ uri: data.thumbnail }} style={[ctx.styles.avatarImg, { borderRadius: 12 }]} contentFit="cover" />
        ) : (
          <Text style={{ fontSize: 18 }}>🎮</Text>
        )}
      </View>
      <View style={ctx.styles.peopleInfo}>
        <Text style={[ctx.styles.peopleName, { color: ctx.colors.text.primary }]} numberOfLines={1}>
          {data.name}
        </Text>
        <Text style={[ctx.styles.peopleMeta, { color: ctx.colors.text.muted }]} numberOfLines={1}>
          {data.description || "Play now"}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
