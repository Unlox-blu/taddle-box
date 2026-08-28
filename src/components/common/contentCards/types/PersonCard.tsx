import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import type { RowCtx, FeedEnvelope, PersonData } from "../ContentCard";

export default function PersonCard({ item, ctx }: { item: FeedEnvelope<PersonData>; ctx: RowCtx }) {
  const data = item.data;
  return (
    <TouchableOpacity style={ctx.styles.peopleRow} onPress={() => ctx.openUser(data)} activeOpacity={0.8}>
      <View style={ctx.styles.avatarBubble}>
        {data.avatarUrl ? (
          <Image source={{ uri: data.avatarUrl }} style={ctx.styles.avatarImg} contentFit="cover" />
        ) : (
          <Text style={{ fontSize: 18 }}>👾</Text>
        )}
      </View>
      <View style={ctx.styles.peopleInfo}>
        <Text style={[ctx.styles.peopleName, { color: ctx.colors.text.primary }]} numberOfLines={1}>
          {data.name} <Text style={{ color: ctx.colors.text.muted, fontWeight: "400" }}>@{data.username}</Text>
        </Text>
        <Text style={[ctx.styles.peopleMeta, { color: ctx.colors.text.muted }]} numberOfLines={1}>
          {data.followerCount} followers
        </Text>
      </View>
    </TouchableOpacity>
  );
}
