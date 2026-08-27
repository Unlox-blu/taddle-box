import { StyleSheet } from "react-native";
import { fontSizes, spacing, radii, type ColorPalette } from "../../theme";

/**
 * Minimal styles consumed by ROW_RENDERERS (people, communities, events, etc.).
 * Shared between SearchScreen and SharedFeed so both can dispatch through the
 * same renderer map without importing SearchStyles.
 */
export function createRowStyles(c: ColorPalette) {
  return StyleSheet.create({
    // ── Row cards ──────────────────────────────────────────────────
    peopleRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.bg.card,
      padding: spacing.md,
      marginHorizontal: spacing.md,
      marginBottom: spacing.md,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
    },

    // ── Avatar / icon bubble ───────────────────────────────────────
    avatarBubble: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.bg.elevated,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
      overflow: "hidden",
    },
    avatarImg: {
      width: "100%",
      height: "100%",
    },

    // ── Text blocks ────────────────────────────────────────────────
    peopleInfo: { flex: 1 },
    peopleName: {
      fontSize: fontSizes.md,
      fontWeight: "700",
      color: c.text.primary,
    },
    peopleHandle: {
      fontSize: fontSizes.sm,
      color: c.text.muted,
      marginTop: 2,
    },
    peopleMeta: {
      fontSize: fontSizes.xs,
      color: c.text.muted,
      marginTop: 2,
      opacity: 0.8,
    },
    commentContent: {
      fontSize: fontSizes.sm,
      color: c.text.primary,
      marginTop: 4,
      lineHeight: 20,
    },

    // ── Media thumbnail ────────────────────────────────────────────
    mediaThumbWrap: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.bg.elevated,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
      overflow: "hidden",
    },
    mediaThumb: { width: "100%", height: "100%" },

    // ── Generic fallback ───────────────────────────────────────────
    genericRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.bg.card,
      padding: spacing.md,
      marginHorizontal: spacing.md,
      marginBottom: spacing.md,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
    },
    genericIconBubble: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.bg.elevated,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    genericTypeLabel: {
      fontSize: fontSizes.xs,
      fontWeight: "700",
      color: c.text.muted,
      textTransform: "capitalize",
      letterSpacing: 0.4,
      marginBottom: 2,
    },

    // ── Hashtag rows ───────────────────────────────────────────────
    hashtagRow: {
      flexDirection: "row",
      alignItems: "center",
      padding: spacing.md,
      marginHorizontal: spacing.md,
      marginBottom: spacing.md,
    },
    hashIconBubble: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.bg.elevated,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    hashIcon: {
      fontSize: fontSizes.lg,
      fontWeight: "800",
      color: c.primary,
    },
    hashtagText: {
      fontSize: fontSizes.md,
      fontWeight: "600",
      color: c.text.primary,
    },

    // ── Poll cards (SearchRows PollRow) ────────────────────────────
    pollCard: {
      backgroundColor: c.bg.card,
      padding: spacing.md,
      marginHorizontal: spacing.md,
      marginBottom: spacing.md,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
    },
    pollHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
    },
    pollQuestion: {
      fontSize: fontSizes.md,
      fontWeight: "700",
      color: c.text.primary,
      marginBottom: 8,
    },
    pollOption: { marginBottom: 8 },
    pollOptionTextRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 4,
    },
    pollOptionText: {
      flex: 1,
      fontSize: fontSizes.sm,
      color: c.text.primary,
    },
    pollOptionPct: {
      fontSize: fontSizes.xs,
      fontWeight: "700",
      color: c.text.muted,
      marginLeft: 8,
    },
    pollBarTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: c.bg.elevated,
      overflow: "hidden",
    },
    pollBarFill: {
      height: "100%",
      borderRadius: 3,
      backgroundColor: c.primary,
      opacity: 0.6,
    },
  });
}

export type RowStyles = ReturnType<typeof createRowStyles>;
