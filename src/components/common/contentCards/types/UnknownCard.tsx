import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { RowCtx } from "../ContentCard";

export default function UnknownCard({ item, ctx }: { item: any; ctx: RowCtx }) {
  return (
    <View style={[ctx.styles.peopleRow, { opacity: 0.6 }]}>
      <View style={ctx.styles.avatarBubble}>
        <Ionicons name="help" size={20} color={ctx.colors.text.muted} />
      </View>
      <View style={ctx.styles.peopleInfo}>
        <Text style={[ctx.styles.peopleName, { color: ctx.colors.text.primary }]}>Unknown Content</Text>
        <Text style={[ctx.styles.peopleMeta, { color: ctx.colors.text.muted }]}>Type: {item?.itemType || 'missing'}</Text>
      </View>
    </View>
  );
}
