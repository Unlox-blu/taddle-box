import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ContentItem, FeedCtx } from "../content-card.types";
import { fontSizes, radii, spacing } from "../../../../../design-system";
import { useThemeColors } from "../../../../../design-system/theme/ThemeProvider";

// Maps each settings item id to its destination route.
// Items that just open /settings are handled by the fallback.
const ROUTE_MAP: Record<string, string> = {
  edit_profile:        "/settings/edit-profile",
  change_password:     "/settings/change-password",
  phone:               "/settings/change-phone",
  email:               "/settings/change-email",
  terms:               "/terms",
  privacy_policy:      "/privacy",
};

export default function SettingsCard({
  item,
}: {
  item: ContentItem;
  ctx: FeedCtx;
}) {
  const router = useRouter();
  const colors = useThemeColors();
  const data = item.data as {
    id: string;
    title: string;
    icon: string;
  };

  if (!data) return null;

  const handlePress = () => {
    const route = ROUTE_MAP[data.id];
    if (route) {
      router.push(route as never);
    } else {
      // All other items (security, notifications, privacy, preferences,
      // delete account, logout) live on the main settings screen.
      router.push("/settings" as never);
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.row,
        {
          backgroundColor: colors.bg.card,
          borderColor: colors.border,
        },
      ]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconWrap, { backgroundColor: "rgba(124,58,237,0.12)" }]}>
        <Ionicons
          name={data.icon as any}
          size={18}
          color={colors.primaryLight}
        />
      </View>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text.primary }]}>
          {data.title}
        </Text>
        <Text style={[styles.subtitle, { color: colors.text.muted }]}>
          Settings
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: spacing.lg,
    marginBottom: 8,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { flex: 1 },
  title: {
    fontSize: fontSizes.md,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
});
