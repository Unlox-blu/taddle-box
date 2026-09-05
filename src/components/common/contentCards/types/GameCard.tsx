import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import type { FeedCtx, ContentItem, GameData } from "../content";

export default function GameCard({
  item,
  ctx,
}: {
  item: ContentItem;
  ctx: FeedCtx;
}) {
  const data: GameData = item.data || {};
  const gameId = data.slug || data.id || item.id;
  const bannerUrl =
    data.metadata?.cardUrl ||
    data.cardUrl ||
    data.bannerUrl ||
    (data as any).banner ||
    (data as any).imageUrl;
  const logoUrl =
    data.thumbnail ||
    data.logoUrl ||
    (data as any).logo ||
    data.metadata?.thumbnail;

  return (
    <TouchableOpacity
      style={{
        backgroundColor: ctx.colors.bg.card,
        borderRadius: 16,
        marginHorizontal: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: ctx.colors.border,
        overflow: "hidden",
      }}
      onPress={() => ctx.openGames(gameId)}
      activeOpacity={0.85}
    >
      {/* Banner Top (Height 80px) with matching curved top corners */}
      <View
        style={{
          height: 80,
          width: "100%",
          backgroundColor: ctx.colors.bg.elevated,
          borderTopLeftRadius: 15,
          borderTopRightRadius: 15,
          overflow: "hidden",
        }}
      >
        {bannerUrl ? (
          <Image
            source={{ uri: bannerUrl }}
            style={{
              width: "100%",
              height: "100%",
              borderTopLeftRadius: 15,
              borderTopRightRadius: 15,
            }}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <LinearGradient
            colors={["#7C3AED", "#0891B2"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: "100%",
              height: "100%",
              borderTopLeftRadius: 15,
              borderTopRightRadius: 15,
            }}
          />
        )}
      </View>

      {/* Card Body with Overlapping Logo */}
      <View style={{ paddingHorizontal: 14, paddingBottom: 14, paddingTop: 0 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            marginTop: -24,
          }}
        >
          {/* Logo / Thumbnail Squircle */}
          <View
            style={{
              width: 50,
              height: 50,
              borderRadius: 12,
              backgroundColor: ctx.colors.bg.card,
              borderWidth: 3,
              borderColor: ctx.colors.bg.card,
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 4,
              elevation: 3,
            }}
          >
            {logoUrl ? (
              <Image
                source={{ uri: logoUrl }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
              />
            ) : (
              <View
                style={{
                  width: "100%",
                  height: "100%",
                  backgroundColor: "#A78BFA20",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="game-controller" size={24} color="#A78BFA" />
              </View>
            )}
          </View>
        </View>

        {/* Info */}
        <View style={{ marginTop: 8 }}>
          <Text
            style={{
              fontSize: 16,
              fontWeight: "800",
              color: ctx.colors.text.primary,
            }}
            numberOfLines={1}
          >
            {data.name}
          </Text>

          {data.description ? (
            <Text
              style={{
                fontSize: 13,
                color: ctx.colors.text.secondary,
                marginTop: 3,
                lineHeight: 18,
              }}
              numberOfLines={2}
            >
              {data.description}
            </Text>
          ) : null}

          {(data.xpReward || data.metadata?.xpReward) ? (
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: ctx.colors.xpOrange || "#F59E0B",
                marginTop: 6,
              }}
            >
              +{data.xpReward || data.metadata?.xpReward} XP
            </Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}
