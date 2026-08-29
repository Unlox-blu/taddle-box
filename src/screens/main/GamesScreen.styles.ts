/**
 * GamesScreen.styles.ts — shared styles for GamesScreen and its extracted components.
 * Extracted from GamesScreen.tsx for modularity.
 */

import { StyleSheet, Dimensions } from "react-native";
import type { ColorPalette } from "../../theme";
import { spacing } from "../../theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg.base },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.bg.card,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    statsRow: {
      flexDirection: "row",
      justifyContent: "space-around",
      paddingVertical: 16,
      paddingHorizontal: 12,
      backgroundColor: c.bg.card,
      borderRadius: 16,
      marginBottom: 16,
    },
    statItem: { alignItems: "center" },
    statValue: { fontSize: 20, fontWeight: "700", color: c.text.primary },
    statLabel: { fontSize: 12, color: c.text.secondary, marginTop: 2 },

    // Game card
    gameCard: {
      width: "100%",
      backgroundColor: c.bg.card,
      borderRadius: 16,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: c.border,
    },
    gameGridWrapper: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginHorizontal: -4,
    },
    gameGridItem: {
      width: "50%",
      paddingHorizontal: 4,
      marginBottom: 8,
    },
    gameArt: {
      width: "100%",
      height: 90,
      justifyContent: "center",
      alignItems: "center",
    },
    gameBadge: {
      backgroundColor: c.primary,
      color: "#fff",
      fontSize: 10,
      fontWeight: "700",
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      overflow: "hidden",
    },
    gameBody: { padding: 10, paddingTop: 8 },
    gameTitle: { fontSize: 14, fontWeight: "600", color: c.text.primary },
    gameMeta: { fontSize: 11, color: c.text.secondary, marginTop: 2 },

    // Primary button
    primaryButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 10,
      borderRadius: 10,
      gap: 6,
    },
    primaryButtonText: {
      color: "#fff",
      fontSize: 13,
      fontWeight: "700",
    },

    // Tournament card — rectangle shape, 1 per row
    tournamentCard: {
      width: "100%",
      backgroundColor: c.bg.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      flexDirection: "row",
      alignItems: "stretch",
      overflow: "hidden",
    },
    tournamentBanner: {
      width: 100,
      minHeight: 100,
      justifyContent: "center",
      alignItems: "center",
    },
    tournamentBannerOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.25)",
    },
    tournamentInfo: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 4,
    },
    tournamentTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: c.text.primary,
    },
    tournamentMeta: {
      fontSize: 12,
      color: c.text.secondary,
    },
    tournamentPrize: {
      fontSize: 13,
      fontWeight: "700",
      color: c.primary,
    },
    tournamentTimeBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "rgba(124,58,237,0.12)",
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      alignSelf: "flex-start",
      marginTop: 4,
    },
    tournamentTimeText: {
      fontSize: 11,
      fontWeight: "600",
      color: c.primaryLight,
    },
    tournamentAction: {
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 14,
    },

    // Match row
    matchRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    matchIcon: { width: 44, height: 44, marginRight: 12, borderRadius: 11, overflow: "hidden" },
    matchBody: { flex: 1 },
    matchTitle: { fontSize: 14, fontWeight: "600", color: c.text.primary },
    matchMeta: { fontSize: 12, color: c.text.secondary, marginTop: 2 },
    matchRight: { alignItems: "flex-end" },
    matchResult: { fontSize: 14, fontWeight: "700" },
    matchXp: { fontSize: 12, color: c.text.secondary, marginTop: 2 },

    // Modal
    modalShell: { flex: 1, backgroundColor: c.bg.base },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: c.text.primary,
    },
    modalContent: { padding: 16 },

    // Score box
    scoreBox: {
      alignItems: "center",
      backgroundColor: c.bg.elevated,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    scoreLabel: { fontSize: 10, color: c.text.secondary },
    scoreValue: { fontSize: 16, fontWeight: "700", color: c.primary },

    // Settings
    settingsSection: {
      fontSize: 14,
      fontWeight: "600",
      color: c.text.secondary,
      marginBottom: 8,
      marginTop: 16,
    },
    settingsCard: {
      backgroundColor: c.bg.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    settingsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    settingsRowLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    settingsRowLabel: {
      fontSize: 14,
      fontWeight: "500",
      color: c.text.primary,
    },
    settingsRowDesc: {
      fontSize: 12,
      color: c.text.secondary,
      marginTop: 1,
    },

    // Play stage
    playStage: {
      flex: 1,
      backgroundColor: "#000",
    },

    // Content
    content: {
      padding: 16,
      paddingBottom: 100,
    },

    // Section
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing.md,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: c.text.primary,
    },
    sectionAction: {
      fontSize: 14,
      color: c.primary,
      fontWeight: "600",
    },

    // Info pill
    infoPill: {
      alignItems: "center",
      backgroundColor: c.bg.card,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    infoValue: {
      fontSize: 16,
      fontWeight: "700",
      color: c.text.primary,
    },
    infoLabel: {
      fontSize: 11,
      color: c.text.secondary,
      marginTop: 2,
    },

    // Invite banner
    inviteBanner: {
      backgroundColor: c.bg.card,
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: c.border,
    },
    inviteBannerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    inviteAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.bg.elevated,
    },
    inviteBannerText: {
      flex: 1,
      fontSize: 14,
      color: c.text.primary,
    },
    inviteBannerActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 8,
      marginTop: 8,
    },
    inviteJoinBtn: {
      backgroundColor: c.primary,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
    },
    inviteJoinBtnText: {
      color: "#fff",
      fontSize: 13,
      fontWeight: "600",
    },
    inviteDenyBtn: {
      backgroundColor: c.bg.elevated,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    inviteDenyBtnText: {
      color: c.text.secondary,
      fontSize: 13,
      fontWeight: "600",
    },

    // Play modal
    playModal: {
      flex: 1,
      backgroundColor: c.bg.base,
    },
    playHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    playHeaderCenter: {
      flex: 1,
      alignItems: "center",
    },
    playHeaderTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    playTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: c.text.primary,
    },
    playHeaderRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },

    // Tab bar
    tabBar: {
      flexDirection: "row",
      paddingHorizontal: 16,
      gap: 8,
      marginBottom: 16,
    },
    tab: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: c.bg.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    tabActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    tabText: {
      fontSize: 13,
      fontWeight: "600",
      color: c.text.secondary,
    },
    tabTextActive: {
      color: "#fff",
    },
  });
}
