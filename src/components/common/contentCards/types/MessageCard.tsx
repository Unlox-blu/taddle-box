import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { FeedCtx, ContentItem } from "../content";

export default function MessageCard({
  item,
  ctx,
}: {
  item: ContentItem;
  ctx: FeedCtx;
}) {
  const data = item.data;

  const senderName =
    data.author?.name || data.sender?.name || data.senderName || "Unknown";
  const content = data.content || data.message || data.text || "";
  const conversationName =
    data.conversationName || data.community?.name || "";

  return (
    <TouchableOpacity
      style={[ctx.styles.peopleRow, { paddingVertical: 12 }]}
      activeOpacity={0.8}
    >
      <View
        style={[
          ctx.styles.avatarBubble,
          {
            alignSelf: "flex-start",
            marginTop: 2,
            backgroundColor: ctx.colors.bg.elevated,
          },
        ]}
      >
        <Ionicons name="chatbubbles" size={20} color={ctx.colors.primaryLight} />
      </View>
      <View style={ctx.styles.peopleInfo}>
        {conversationName ? (
          <Text
            style={[
              ctx.styles.peopleMeta,
              { color: ctx.colors.text.muted, marginBottom: 2 },
            ]}
            numberOfLines={1}
          >
            {conversationName}
          </Text>
        ) : null}
        <Text
          style={[
            ctx.styles.peopleMeta,
            { color: ctx.colors.text.muted, marginBottom: 4 },
          ]}
          numberOfLines={1}
        >
          {senderName}
        </Text>
        <Text
          style={[
            ctx.styles.peopleName,
            {
              color: ctx.colors.text.primary,
              fontSize: 14,
              fontWeight: "400",
            },
          ]}
          numberOfLines={2}
        >
          {item.highlight?.content || content}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
