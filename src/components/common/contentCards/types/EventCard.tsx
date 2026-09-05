import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import type { FeedCtx, ContentItem, EventData } from "../content";

export default function EventCard({
  item,
  ctx,
}: {
  item: ContentItem;
  ctx: FeedCtx;
}) {
  const data: EventData = item.data || {};
  const eventId = data.id || item.id;
  const coverUrl =
    data.cover_image_url ||
    data.coverImageUrl ||
    data.bannerUrl ||
    data.banner;
  const logoUrl =
    data.logoUrl ||
    (data as any).logo ||
    (data as any).organizerAvatar ||
    (data as any).community?.avatarUrl;

  const locationText =
    typeof data.location === "string"
      ? data.location
      : typeof data.location === "object" && data.location !== null
      ? (data.location as any).type === "virtual" || (data.location as any).type === "online"
        ? "Online"
        : (data.location as any).address || (data.location as any).name || "Online"
      : null;

  const rawDate = data.startTime || data.start_time;
  const eventDate = rawDate
    ? new Date(rawDate).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

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
      onPress={() => ctx.openEvents(eventId, data)}
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
        {coverUrl ? (
          <Image
            source={{ uri: coverUrl }}
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
            colors={["#D97706", "#78350F"]}
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
                  backgroundColor: "#F59E0B20",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="calendar" size={24} color="#F59E0B" />
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
            {data.title}
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

          {(eventDate || locationText || data.attendeeCount || data.attendeesCount) ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                marginTop: 6,
              }}
            >
              {eventDate ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Ionicons name="calendar-outline" size={12} color={ctx.colors.text.muted} />
                  <Text style={{ fontSize: 12, color: ctx.colors.text.muted, fontWeight: "500" }}>
                    {eventDate}
                  </Text>
                </View>
              ) : null}
              {locationText ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Ionicons name="location-outline" size={12} color={ctx.colors.text.muted} />
                  <Text style={{ fontSize: 12, color: ctx.colors.text.muted, fontWeight: "500" }} numberOfLines={1}>
                    {locationText}
                  </Text>
                </View>
              ) : null}
              {(data.attendeeCount || data.attendeesCount) ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Ionicons name="people-outline" size={12} color={ctx.colors.text.muted} />
                  <Text style={{ fontSize: 12, color: ctx.colors.text.muted, fontWeight: "500" }}>
                    {data.attendeeCount || data.attendeesCount} attending
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}
