import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { RowCtx, CommentSearchItem } from "../ContentCard";

const HighlightedText = ({ text, style, numberOfLines, colors }: any) => {
  if (!text) return null;
  const parts = text.split(/(<mark>[^<]+<\/mark>)/g);
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part: string, i: number) => {
        if (part.startsWith("<mark>") && part.endsWith("</mark>")) {
          return (
            <Text key={i} style={{ backgroundColor: colors.primaryLight + "40", fontWeight: "700" }}>
              {part.slice(6, -7)}
            </Text>
          );
        }
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
};

export default function CommentCard({ item, ctx }: { item: CommentSearchItem; ctx: RowCtx }) {
  return (
    <TouchableOpacity style={[ctx.styles.peopleRow, { paddingVertical: 12 }]} onPress={() => ctx.openPost({ id: item.post_id })} activeOpacity={0.8}>
      <View style={[ctx.styles.avatarBubble, { alignSelf: 'flex-start', marginTop: 2, backgroundColor: ctx.colors.bg.elevated }]}>
        <Ionicons name="chatbubble" size={20} color={ctx.colors.primaryLight} />
      </View>
      <View style={ctx.styles.peopleInfo}>
        <Text style={[ctx.styles.peopleMeta, { color: ctx.colors.text.muted, marginBottom: 4 }]} numberOfLines={1}>
          {item.author.name} commented on:
        </Text>
        <HighlightedText
          text={item.highlight_content || item.content}
          style={[ctx.styles.peopleName, { color: ctx.colors.text.primary, fontSize: 14, fontWeight: "400" }]}
          numberOfLines={3}
          colors={ctx.colors}
        />
      </View>
    </TouchableOpacity>
  );
}
