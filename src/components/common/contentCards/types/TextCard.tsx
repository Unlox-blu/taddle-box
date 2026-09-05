import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { FeedCtx, ContentItem } from "../content";

export default function TextCard({ item, ctx }: { item: ContentItem; ctx: FeedCtx }) {
  const data = item.data;
  return (
    <TouchableOpacity
      style={ctx.styles.peopleRow}
      onPress={() => ctx.addHashtag(data.text.replace("#", ""))}
      activeOpacity={0.8}
    >
      <View
        style={[
          ctx.styles.avatarBubble,
          {
            backgroundColor: ctx.colors.xpGold + "20",
            alignItems: "center",
            justifyContent: "center",
          },
        ]}
      >
        <Feather name="hash" size={18} color={ctx.colors.xpGold} />
      </View>
      <View style={ctx.styles.peopleInfo}>
        <Text style={[ctx.styles.peopleName, { color: ctx.colors.text.primary }]} numberOfLines={1}>
          {data.text}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
