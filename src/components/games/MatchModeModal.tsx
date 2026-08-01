import React, { useState, useMemo, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../context/ThemeContext";
import { fontSizes, radii, spacing, type ColorPalette } from "../../theme";
import type { HtmlGameDefinition } from "../../games/types";
import { useAuth } from "../../context/AuthContext";

export type MatchVisibility = "PUBLIC" | "PRIVATE";
export type MatchPlayers = "auto" | number;

interface MatchModeModalProps {
  visible: boolean;
  game: HtmlGameDefinition | null;
  onClose: () => void;
  onStartMatch: (visibility: MatchVisibility, targetPlayers: MatchPlayers) => void;
}

export default function MatchModeModal({
  visible,
  game,
  onClose,
  onStartMatch,
}: MatchModeModalProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [visibility, setVisibility] = useState<MatchVisibility>("PUBLIC");
  const [targetPlayers, setTargetPlayers] = useState<MatchPlayers>("auto");

  useEffect(() => {
    if (visible) {
      setVisibility("PUBLIC");
      setTargetPlayers("auto");
    }
  }, [visible]);

  if (!game) return null;

  const maxOpponents = game.maxPlayers || 2;
  const playerOptions = ["auto"];
  for (let i = 2; i <= maxOpponents; i++) {
    playerOptions.push(i);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top || 16 }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.title}>Create Match</Text>
          <View style={styles.closeBtn} />
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          {/* Players Selection */}
          <Text style={styles.sectionTitle}>Players</Text>
          <View style={styles.optionsList}>
            {playerOptions.map((opt) => {
              const isSelected = targetPlayers === opt;
              const isAuto = opt === "auto";
              return (
                <TouchableOpacity
                  key={String(opt)}
                  style={[styles.optionCard, isSelected && styles.optionCardActive]}
                  onPress={() => setTargetPlayers(opt as MatchPlayers)}
                >
                  <View style={styles.optionIconBox}>
                    <Ionicons
                      name={isAuto ? "star" : "people"}
                      size={20}
                      color={isSelected ? colors.primaryLight : colors.text.muted}
                    />
                  </View>
                  <Text style={[styles.optionText, isSelected && styles.optionTextActive]}>
                    {isAuto ? "Auto (Recommended)" : `${opt} Players`}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={24} color={colors.primaryLight} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Visibility Selection */}
          <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>Visibility</Text>
          <View style={styles.optionsList}>
            <TouchableOpacity
              style={[styles.optionCard, visibility === "PUBLIC" && styles.optionCardActive]}
              onPress={() => setVisibility("PUBLIC")}
            >
              <View style={styles.optionIconBox}>
                <Ionicons
                  name="earth"
                  size={20}
                  color={visibility === "PUBLIC" ? colors.primaryLight : colors.text.muted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionText, visibility === "PUBLIC" && styles.optionTextActive]}>
                  Public
                </Text>
                <Text style={styles.optionDesc}>Anyone can join via quick match.</Text>
              </View>
              {visibility === "PUBLIC" && (
                <Ionicons name="checkmark-circle" size={24} color={colors.primaryLight} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionCard, visibility === "PRIVATE" && styles.optionCardActive]}
              onPress={() => setVisibility("PRIVATE")}
            >
              <View style={styles.optionIconBox}>
                <Ionicons
                  name="lock-closed"
                  size={20}
                  color={visibility === "PRIVATE" ? colors.primaryLight : colors.text.muted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionText, visibility === "PRIVATE" && styles.optionTextActive]}>
                  Private
                </Text>
                <Text style={styles.optionDesc}>Only invited players can join.</Text>
              </View>
              {visibility === "PRIVATE" && (
                <Ionicons name="checkmark-circle" size={24} color={colors.primaryLight} />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.startBtn}
              onPress={() => onStartMatch(visibility, targetPlayers)}
            >
              <LinearGradient
                colors={[colors.primary, colors.cyanDark]}
                style={styles.startGradient}
              >
                <Text style={styles.startText}>
                  {visibility === "PRIVATE" ? "Create Private Lobby" : "Find Match"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg.base },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    closeBtn: { padding: 4, width: 32 },
    title: { fontSize: fontSizes.lg, fontWeight: "700", color: c.text.primary },
    body: { padding: spacing.lg, paddingBottom: 60 },

    sectionTitle: {
      fontSize: fontSizes.md,
      fontWeight: "700",
      color: c.text.primary,
      marginBottom: spacing.md,
    },
    optionsList: { gap: spacing.sm },
    optionCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.bg.card,
      padding: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    optionCardActive: {
      borderColor: c.primaryLight,
      backgroundColor: c.bg.elevated,
    },
    optionIconBox: {
      width: 40,
      height: 40,
      borderRadius: radii.sm,
      backgroundColor: c.bg.elevated,
      alignItems: "center",
      justifyContent: "center",
      marginRight: spacing.sm,
    },
    optionText: {
      flex: 1,
      fontSize: fontSizes.md,
      color: c.text.primary,
      fontWeight: "600",
    },
    optionTextActive: {
      color: c.primaryLight,
    },
    optionDesc: {
      fontSize: fontSizes.xs,
      color: c.text.muted,
      marginTop: 2,
    },

    actionRow: {
      marginTop: spacing.xl,
      alignItems: "center",
    },
    startBtn: {
      width: "100%",
      height: 56,
      borderRadius: radii.full,
      overflow: "hidden",
    },
    startGradient: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    startText: {
      color: "#fff",
      fontSize: fontSizes.md,
      fontWeight: "700",
    },
  });
}
