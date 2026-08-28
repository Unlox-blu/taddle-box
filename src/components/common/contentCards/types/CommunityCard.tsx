import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import type { RowCtx, FeedEnvelope, CommunityData } from "../ContentCard";

export default function CommunityCard({ item, ctx }: { item: FeedEnvelope<CommunityData>; ctx: RowCtx }) {
  const data = item.data;
  return (
    <TouchableOpacity style={ctx.styles.peopleRow} onPress={() => ctx.openCommunity(data.slug)} activeOpacity={0.8}>
      <View style={[ctx.styles.avatarBubble, { backgroundColor: ctx.colors.cyanLight + "20", borderRadius: 8 }]}>
        {data.avatarUrl ? (
          <Image source={{ uri: data.avatarUrl }} style={[ctx.styles.avatarImg, { borderRadius: 8 }]} contentFit="cover" />
        ) : (
          <Text style={{ fontSize: 18 }}>🪐</Text>
        )}
      </View>
      <View style={ctx.styles.peopleInfo}>
        <Text style={[ctx.styles.peopleName, { color: ctx.colors.text.primary }]} numberOfLines={1}>
          {data.name} <Text style={{ color: ctx.colors.text.muted, fontWeight: "400" }}>c/{data.slug}</Text>
        </Text>
        <Text style={[ctx.styles.peopleMeta, { color: ctx.colors.text.muted }]} numberOfLines={1}>
          {data.memberCount} members
        </Text>
      </View>
    </TouchableOpacity>
  );
}
