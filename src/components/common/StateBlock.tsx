import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fontSizes, spacing, radii } from "../../theme";
import { useThemeColors } from "../../context/ThemeContext";
import BrandedLoader from "./BrandedLoader";

interface StateBlockProps {
  /** Show the branded loader (optionally with a label) instead of the empty state. */
  loading?: boolean;
  /** Text under the loader while loading. */
  label?: string;
  /** Empty-state icon (Ionicons name). */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Primary heading — optional for loading-only states; the loading label
      also renders in this style. */
  title?: string;
  /** Supporting line under the title. */
  subtitle?: string;
  /** Optional call-to-action button (rendered only with onAction). */
  actionLabel?: string;
  onAction?: () => void;
  /** Card look (Events/Games: bordered panel) vs plain centered (Communities). */
  card?: boolean;
  /** Compact inline mode for load-more footers, status lines and button
      spinners: a small branded loader (or muted text) with no container
      padding — the caller adds spacing via `style`. */
  inline?: boolean;
  /** Loader diameter in inline mode (default 24; ~18 for button spinners). */
  loaderSize?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shared loading / empty state block for the section screens. Replaces the
 * duplicated blocks in Communities (plain, large icon + optional CTA),
 * Events (card, medium icon) and Games (card, loader with label).
 */
export default function StateBlock({
  loading = false,
  label,
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
  card = false,
  inline = false,
  loaderSize,
  style,
}: StateBlockProps) {
  const colors = useThemeColors();
  return (
    <View
      style={[
        inline ? styles.inline : card ? styles.card : styles.plain,
        card
          ? { backgroundColor: colors.bg.card, borderColor: colors.border }
          : null,
        style,
      ]}
    >
      {loading ? (
        <>
          <BrandedLoader size={inline ? loaderSize ?? 24 : 44} />
          {label ? (
            <Text
              style={
                inline
                  ? [styles.inlineText, { color: colors.text.muted }]
                  : [styles.title, { color: colors.text.primary }]
              }
            >
              {label}
            </Text>
          ) : null}
        </>
      ) : (
        <>
          {icon ? (
            <Ionicons
              name={icon}
              size={card ? 40 : 56}
              color={colors.text.muted}
              style={card ? styles.cardIcon : styles.plainIcon}
            />
          ) : null}
          {title ? (
            <Text
              style={
                inline
                  ? [styles.inlineText, { color: colors.text.muted }]
                  : [
                      styles.title,
                      { color: colors.text.primary },
                      !card && styles.plainTitle,
                    ]
              }
            >
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text
              style={
                inline
                  ? [styles.inlineText, { color: colors.text.muted }]
                  : [
                      styles.subtitle,
                      { color: colors.text.muted },
                      card && styles.cardSubtitle,
                      !card && styles.plainSubtitle,
                    ]
              }
            >
              {subtitle}
            </Text>
          ) : null}
          {actionLabel && onAction ? (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.primary }]}
              onPress={onAction}
              activeOpacity={0.8}
            >
              <Text style={styles.btnText}>{actionLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  plain: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: spacing.xl,
  },
  inline: {
    alignItems: "center",
  },
  inlineText: {
    fontSize: fontSizes.sm,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 4,
  },
  card: {
    alignItems: "center",
    margin: spacing.lg,
    paddingVertical: 28,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  plainIcon: { marginBottom: 16 },
  cardIcon: { marginBottom: 8 },
  title: {
    fontSize: fontSizes.md,
    fontWeight: "900",
    textAlign: "center",
  },
  plainTitle: {
    fontSize: fontSizes.xl,
    fontWeight: "800",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: fontSizes.sm,
    textAlign: "center",
  },
  cardSubtitle: {
    marginTop: 6,
  },
  plainSubtitle: {
    lineHeight: 22,
  },
  btn: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: radii.full,
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  btnText: { fontSize: fontSizes.md, fontWeight: "700", color: "#fff" },
});
