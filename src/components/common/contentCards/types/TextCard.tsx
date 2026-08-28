import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { RowCtx, FeedEnvelope, TextData } from "../ContentCard";

export default function TextCard({ item, ctx }: { item: FeedEnvelope<TextData>; ctx: RowCtx }) {
  const data = item.data;
  return (
    <TouchableOpacity style={ctx.styles.peopleRow} onPress={() => ctx.addHashtag(data.text.replace("#", ""))} activeOpacity={0.8}>
      <View style={[ctx.styles.avatarBubble, { backgroundColor: ctx.colors.xpGold + "20" }]}>
        <Ionicons name="pricetag" size={18} color={ctx.colors.xpGold} />
      </View>
      <View style={ctx.styles.peopleInfo}>
        <Text style={[ctx.styles.peopleName, { color: ctx.colors.text.primary }]} numberOfLines={1}>
          {data.text}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
