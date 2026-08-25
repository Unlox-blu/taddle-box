import React, { useEffect, useState, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
} from "react-native";
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import StateBlock from "../../common/StateBlock";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fontSizes, radii, spacing } from "../../../theme";
import { useThemeColors } from "../../../context/ThemeContext";
import { apiClient } from "../../../services/apiClient";
import type { GameTournament } from "../../../services/games.service";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { HomeStackParamList } from "../../../types";
import { useAuth } from "../../../context/AuthContext";
import { error } from '../../../utils/logger';

type Props = {
  visible: boolean;
  tournament: GameTournament | null;
  onClose: () => void;
};

type LeaderboardEntry = {
  userId: string;
  name: string;
  username: string;
  avatarUrl: string;
  bestScore: number;
};

export default function TournamentLeaderboardModal({ visible, tournament, onClose }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, insets), [colors, insets]);
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  // True when the current user is NOT inside the fetched top-10 slice but has
  // played — their rank is still surfaced via a footer card.
  const meInTop = leaderboard.some((e) => e.userId === user?.id);
  const showMyRankFooter =
    !meInTop && tournament?.myRank != null && user?.id != null;

  useEffect(() => {
    if (visible && tournament) {
      setLoading(true);
      apiClient.get(`/game/tournaments/${tournament.id}/leaderboard?limit=10`)
        .then(res => setLeaderboard(res.data.data))
        .catch(err => error("Failed to load tournament leaderboard", err))
        .finally(() => setLoading(false));
    }
  }, [visible, tournament]);

  const renderItem = ({ item, index }: { item: LeaderboardEntry; index: number }) => {
    return (
      <TouchableOpacity 
        style={[styles.playerRow, item.userId === user?.id && styles.playerRowMine]} 
        activeOpacity={0.7}
        onPress={() => {
          onClose();
          navigation.push("UserProfile", {
            user: {
              id: item.userId,
              name: item.name,
              username: item.username,
              handle: item.username,
              avatar: item.avatarUrl,
              avatarUrl: item.avatarUrl,
            } as any
          });
        }}
      >
        <Text style={styles.rankText}>#{index + 1}</Text>
        {item.avatarUrl ? (
          <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
        ) : (
          // App convention: icon fallback when a player has no avatar (the
          // old hardcoded S3 placeholder URL was 404).
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Ionicons name="person" size={18} color="#fff" />
          </View>
        )}
        <View style={styles.playerInfo}>
          <Text style={styles.playerName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.playerUsername}>@{item.username}</Text>
        </View>
        <Text style={styles.scoreText}>{item.bestScore} {item.bestScore === 1 ? 'win' : 'wins'}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <LinearGradient
            colors={[colors.bg.card, colors.bg.base]}
            style={styles.headerGradient}
          >
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Top 10 Players</Text>
                <Text style={styles.subtitle}>{tournament?.title}</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
          </LinearGradient>

          {loading ? (
            <StateBlock loading style={styles.centerBox} />
          ) : leaderboard.length === 0 ? (
            <View style={styles.centerBox}>
              <Ionicons name="trophy-outline" size={48} color={colors.text.muted} style={{ marginBottom: spacing.sm }} />
              <Text style={styles.emptyText}>No players have completed a match yet.</Text>
            </View>
          ) : (
            <>
              <FlashList
                data={leaderboard}
                keyExtractor={(item) => item.userId}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
              />
              {showMyRankFooter && (
                <View style={styles.myRankFooter}>
                  <Ionicons name="podium-outline" size={20} color={colors.xpGold} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.myRankTitle}>
                      You're #{tournament?.myRank}
                    </Text>
                    <Text style={styles.myRankSub}>
                      {tournament?.myScore || 0}{" "}
                      {(tournament?.myScore || 0) === 1 ? "win" : "wins"}{" "}
                      · keep playing to climb!
                    </Text>
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: any, insets: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "flex-end",
    },
    content: {
      backgroundColor: c.bg.base,
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      minHeight: "50%",
      maxHeight: "80%",
      paddingBottom: insets.bottom,
    },
    headerGradient: {
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      padding: spacing.lg,
      borderBottomWidth: 1,
      borderColor: c.border,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    title: {
      fontSize: fontSizes.xl,
      fontWeight: "800",
      color: c.text.primary,
    },
    subtitle: {
      fontSize: fontSizes.sm,
      color: c.text.muted,
      marginTop: 2,
    },
    closeBtn: {
      padding: spacing.xs,
    },
    centerBox: {
      padding: spacing.xl,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyText: {
      color: c.text.muted,
      fontSize: fontSizes.md,
      textAlign: "center",
    },
    listContent: {
      padding: spacing.md,
    },
    playerRow: {
      flexDirection: "row",
      alignItems: "center",
      padding: spacing.md,
      backgroundColor: c.bg.card,
      borderRadius: radii.lg,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: c.border,
    },
    playerRowMine: {
      borderColor: c.primaryLight,
      borderWidth: 1.5,
      backgroundColor: c.primary + "14",
    },
    myRankFooter: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginHorizontal: spacing.md,
      marginBottom: spacing.md,
      padding: spacing.md,
      borderRadius: radii.lg,
      backgroundColor: "rgba(251,191,36,0.1)",
      borderWidth: 1,
      borderColor: "rgba(251,191,36,0.3)",
    },
    myRankTitle: {
      fontSize: fontSizes.md,
      fontWeight: "900",
      color: c.text.primary,
    },
    myRankSub: {
      marginTop: 2,
      fontSize: fontSizes.xs,
      color: c.text.muted,
    },
    rankText: {
      width: 36,
      fontSize: fontSizes.md,
      fontWeight: "900",
      color: c.primaryLight,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: radii.full,
      marginRight: spacing.md,
    },
    avatarFallback: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(124,58,237,0.25)",
    },
    playerInfo: {
      flex: 1,
    },
    playerName: {
      fontSize: fontSizes.md,
      fontWeight: "700",
      color: c.text.primary,
    },
    playerUsername: {
      fontSize: fontSizes.xs,
      color: c.text.muted,
    },
    scoreText: {
      fontSize: fontSizes.md,
      fontWeight: "800",
      color: c.text.primary,
    },
  });
