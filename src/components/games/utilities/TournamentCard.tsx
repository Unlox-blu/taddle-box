import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, ImageBackground, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import GameLogo from "./GameLogo";
import { useThemeColors } from "../../../context/ThemeContext";
import type { Game } from "../../../types";
import type { GameTournament } from "../../../services/games.service";

export default function TournamentCard({
  tournament,
  game,
  onJoin,
  onPlay,
}: {
  tournament: GameTournament;
  game: Game;
  onJoin: () => void;
  onPlay: () => void;
}) {
  const colors = useThemeColors();

  const timeLabel = useMemo(() => {
    if (!tournament.endsAt) return null;
    const diff = new Date(tournament.endsAt).getTime() - Date.now();
    if (diff <= 0) return "Ended";
    const hours = Math.floor(diff / 36e5);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h left`;
    const mins = Math.max(1, Math.floor(diff / 6e4));
    return `${mins}m left`;
  }, [tournament.endsAt]);

  const bgImage = game.metadata?.cardUrl || game.imageUrl || (game as any).thumbnail;

  return (
    <View style={[styles.cardContainer, { borderColor: colors.border, backgroundColor: colors.bg.card }]}>
      <ImageBackground
        source={{ uri: bgImage }}
        style={styles.imageBg}
        imageStyle={{ borderRadius: 16 }}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.8)']}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0.2 }}
          end={{ x: 0, y: 1 }}
        />

        {/* Top Badges */}
        <View style={styles.topRow}>
          {timeLabel ? (
            <BlurView intensity={40} tint="dark" style={styles.timeBadge}>
              <Ionicons name="time-outline" size={14} color="#FBBF24" />
              <Text style={styles.timeText}>{timeLabel}</Text>
            </BlurView>
          ) : <View />}

          <BlurView intensity={40} tint="dark" style={styles.prizeBadge}>
            <Text style={styles.prizeText}>🏆 {tournament.prizeXP?.toLocaleString() || 0} XP</Text>
          </BlurView>
        </View>

        {/* Bottom Content Area */}
        <View style={styles.bottomContent}>
          <GameLogo game={game} size={48} radius={12} style={styles.logo} />
          
          <View style={styles.infoCol}>
            <Text style={styles.title} numberOfLines={1}>
              {tournament.title || game.name}
            </Text>
            <Text style={styles.meta}>
              {tournament.playerCount} / {tournament.maxPlayers} Players Joined
            </Text>
          </View>

          <TouchableOpacity onPress={tournament.isJoined ? onPlay : onJoin} activeOpacity={0.8}>
            <LinearGradient
              colors={tournament.isJoined ? [colors.primary, colors.cyanDark] : ['#F59E0B', '#D97706']}
              style={styles.actionBtn}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.actionBtnText}>{tournament.isJoined ? "PLAY" : "JOIN"}</Text>
              <Ionicons name="chevron-forward" size={14} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    width: "100%",
    height: 160,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  imageBg: {
    flex: 1,
    padding: 12,
    justifyContent: "space-between",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  timeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  timeText: {
    color: "#FBBF24",
    fontSize: 12,
    fontWeight: "700",
  },
  prizeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,215,0,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.4)',
  },
  prizeText: {
    color: "#FFD700",
    fontSize: 13,
    fontWeight: "800",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  bottomContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logo: {
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.2)",
  },
  infoCol: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    marginBottom: 2,
  },
  meta: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontWeight: "600",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
});
