import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { RowCtx, FeedEnvelope, NotificationData } from "../ContentCard";

export default function NotificationCard({ item, ctx }: { item: FeedEnvelope<NotificationData>; ctx: RowCtx }) {
  const data = item.data;
  const isRead = data.isRead;
  
  return (
    <TouchableOpacity style={[ctx.styles.peopleRow, { opacity: isRead ? 0.6 : 1 }]} onPress={() => ctx.openNotifications?.()} activeOpacity={0.8}>
      <View style={[ctx.styles.avatarBubble, { backgroundColor: ctx.colors.primary + "15", borderRadius: 20 }]}>
        <Ionicons name="notifications" size={20} color={ctx.colors.primary} />
      </View>
      <View style={ctx.styles.peopleInfo}>
        <Text style={[ctx.styles.peopleName, { color: ctx.colors.text.primary }]} numberOfLines={1}>
          {data.title || "Notification"}
        </Text>
        <Text style={[ctx.styles.peopleMeta, { color: ctx.colors.text.muted, marginTop: 2 }]} numberOfLines={2}>
          {data.message || "You have a new notification."}
        </Text>
      </View>
      {!isRead && (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ctx.colors.primary, marginLeft: 8 }} />
      )}
    </TouchableOpacity>
  );
}
