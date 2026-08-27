import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import type { RowCtx, PersonSearchItem } from "../ContentCard";

export default function PersonCard({ item, ctx }: { item: PersonSearchItem; ctx: RowCtx }) {
  return (
    <TouchableOpacity style={ctx.styles.peopleRow} onPress={() => ctx.openUser(item)} activeOpacity={0.8}>
      <View style={[ctx.styles.avatarBubble, { backgroundColor: ctx.colors.primaryLight + "20" }]}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={ctx.styles.avatarImg} contentFit="cover" />
        ) : (
          <Text style={{ fontSize: 18 }}>👾</Text>
        )}
      </View>
      <View style={ctx.styles.peopleInfo}>
        <Text style={[ctx.styles.peopleName, { color: ctx.colors.text.primary }]} numberOfLines={1}>
          {item.name} <Text style={{ color: ctx.colors.text.muted, fontWeight: "400" }}>@{item.username}</Text>
        </Text>
        <Text style={[ctx.styles.peopleMeta, { color: ctx.colors.text.muted }]} numberOfLines={1}>
          {item.follower_count} followers
        </Text>
      </View>
    </TouchableOpacity>
  );
}
