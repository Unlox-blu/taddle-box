import React from "react";
import { View, Text } from "react-native";
import type { RowCtx, FeedEnvelope } from "../ContentCard";

export type HeaderData = {
  title: string;
  subtitle?: string;
  marginTop?: number;
};

export default function HeaderCard({
  item,
  ctx,
}: {
  item: FeedEnvelope<HeaderData>;
  ctx: RowCtx;
}) {
  const data = item.data;
  return (
    <View
      style={{
        marginTop: data.marginTop ?? 0,
        marginBottom: 12,
        paddingHorizontal: 20,
      }}
    >
      <Text
        style={{
          fontSize: 24,
          fontWeight: "900",
          letterSpacing: -1,
          color: ctx.colors.text.primary,
        }}
      >
        {data.title}
      </Text>
      {data.subtitle ? (
        <Text
          style={{ fontSize: 13, marginTop: 2, color: ctx.colors.text.muted }}
        >
          {data.subtitle}
        </Text>
      ) : null}
    </View>
  );
}
