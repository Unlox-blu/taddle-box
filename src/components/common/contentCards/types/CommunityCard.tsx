import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import type { FeedCtx, ContentItem } from "../content";

export default function CommunityCard({
  item,
  ctx,
}: {
  item: ContentItem;
  ctx: FeedCtx;
}) {
  const data = item.data || {};
  const bannerUrl =
    data.bannerUrl ||
    data.banner_url ||
    data.banner ||
    data.banner_media_url;
  const avatarUrl =
    data.avatarUrl ||
    data.avatar_url ||
    data.avatar ||
    data.avatar_media_url;

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
      onPress={() => ctx.openCommunity(data.slug)}
      activeOpacity={0.85}
    >
      {/* Banner Top (Height 76px) with matching curved top corners */}
      <View
        style={{
          height: 76,
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
            colors={[ctx.colors.primary, ctx.colors.cyanDark || "#0891B2"]}
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

      {/* Card Body with Overlapping Avatar (Logo) */}
      <View style={{ paddingHorizontal: 14, paddingBottom: 14, paddingTop: 0 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            marginTop: -24,
          }}
        >
          {/* Avatar (Logo) */}
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
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
              />
            ) : (
              <Text style={{ fontSize: 22 }}>🪐</Text>
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
            {data.name}{" "}
            <Text
              style={{
                fontSize: 13,
                fontWeight: "400",
                color: ctx.colors.text.muted,
              }}
            >
              c/{data.slug}
            </Text>
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
          <Text
            style={{
              fontSize: 12,
              color: ctx.colors.text.muted,
              marginTop: 6,
              fontWeight: "600",
            }}
          >
            {data.memberCount ?? 0} members
            {data.postCount ? ` • ${data.postCount} posts` : ""}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
