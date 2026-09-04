/**
 * TransactionReelCard — Full-screen reel for wallet transaction content.
 * Dark immersive card showing transaction amount, type, and details.
 */
import React from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ContentItem } from "../../content";
import type { ReelCtx } from "../../../SharedReels";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export default function TransactionReelCard({
  item,
  ctx,
}: {
  item: ContentItem;
  ctx: ReelCtx;
}) {
  const data = item.data;
  const isCredit = data.type === "earn" || data.type === "topup";
  const color = isCredit ? "#10B981" : "#EF4444";
  const iconName = isCredit ? "arrow-down" : "arrow-up";

  return (
    <View style={styles.container}>
      {/* Icon */}
      <View style={[styles.iconWrap, { backgroundColor: isCredit ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)" }]}>
        <Ionicons name={iconName} size={48} color={color} />
      </View>

      {/* Amount */}
      <Text style={[styles.amount, { color }]}>
        {isCredit ? "+" : "-"}
        {data.currency === "INR" ? "₹" : ""}
        {data.amount}
        {data.currency === "XP" ? " XP" : ""}
      </Text>

      {/* Description */}
      <Text style={styles.description}>
        {data.description || (isCredit ? "Received" : "Paid")}
      </Text>

      {/* Date */}
      <Text style={styles.date}>
        {new Date(data.ts || Date.now()).toLocaleDateString()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_W,
    height: SCREEN_H,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  iconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  amount: {
    fontSize: 48,
    fontWeight: "900",
    marginBottom: 12,
  },
  description: {
    fontSize: 18,
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
  },
  date: {
    fontSize: 14,
    color: "rgba(255,255,255,0.4)",
    marginTop: 16,
  },
});
