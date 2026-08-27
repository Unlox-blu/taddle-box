import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import type { RowCtx, CommunitySearchItem } from "../ContentCard";

export default function CommunityCard({ item, ctx }: { item: CommunitySearchItem; ctx: RowCtx }) {
  return (
    <TouchableOpacity style={ctx.styles.peopleRow} onPress={() => ctx.openCommunity(item.slug)} activeOpacity={0.8}>
      <View style={[ctx.styles.avatarBubble, { backgroundColor: ctx.colors.cyanLight + "20", borderRadius: 8 }]}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={[ctx.styles.avatarImg, { borderRadius: 8 }]} contentFit="cover" />
        ) : (
          <Text style={{ fontSize: 18 }}>🪐</Text>
        )}
      </View>
      <View style={ctx.styles.peopleInfo}>
        <Text style={[ctx.styles.peopleName, { color: ctx.colors.text.primary }]} numberOfLines={1}>
          {item.name} <Text style={{ color: ctx.colors.text.muted, fontWeight: "400" }}>c/{item.slug}</Text>
        </Text>
        <Text style={[ctx.styles.peopleMeta, { color: ctx.colors.text.muted }]} numberOfLines={1}>
          {item.member_count} members
        </Text>
      </View>
    </TouchableOpacity>
  );
}
