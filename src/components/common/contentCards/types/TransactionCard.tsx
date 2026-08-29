import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { RowCtx, FeedEnvelope, TransactionData } from "../ContentCard";

export default function TransactionCard({ item, ctx }: { item: FeedEnvelope<TransactionData>; ctx: RowCtx }) {
  const data = item.data;
  
  const isCredit = data.type === "earn" || data.type === "topup";
  const iconName = isCredit ? "arrow-down" : "arrow-up";
  const color = isCredit ? ctx.colors.success : ctx.colors.danger;
  const bg = isCredit ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)";

  return (
    <TouchableOpacity style={ctx.styles.peopleRow} activeOpacity={0.8}>
      <View style={[ctx.styles.avatarBubble, { backgroundColor: bg, borderRadius: 20 }]}>
        <Ionicons name={iconName} size={20} color={color} />
      </View>
      <View style={ctx.styles.peopleInfo}>
        <Text style={[ctx.styles.peopleName, { color: ctx.colors.text.primary }]} numberOfLines={1}>
          {data.description || (isCredit ? "Received" : "Paid")}
        </Text>
        <Text style={[ctx.styles.peopleMeta, { color: ctx.colors.text.muted, marginTop: 2 }]} numberOfLines={1}>
          {new Date(data.ts || Date.now()).toLocaleDateString()}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ fontWeight: "bold", color: color, fontSize: 16 }}>
          {isCredit ? "+" : "-"}
          {data.currency === "INR" ? "₹" : ""}{data.amount}
          {data.currency === "XP" ? " XP" : ""}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
