/**
 * TournamentCard — displays a tournament in a rectangle layout.
 * Game banner on the left, tournament info in the center, action button on the right.
 */
import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, ImageBackground, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import GameLogo from "./GameLogo";
import { useThemeColors } from "../../../context/ThemeContext";
import { makeStyles } from "../../../screens/main/GamesScreen.styles";
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
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const timeLabel = useMemo(() => {
    if (!tournament.endsAt) return null;
    const diff = new Date(tournament.endsAt).getTime() - Date.now();
    if (diff <= 0) return "Ended";
    const hours = Math.floor(diff / 36e5);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h left`;
    if (hours > 0) return `${hours}h left`;
    const mins = Math.max(1, Math.floor(diff / 6e4));
    return `${mins}m left`;
  }, [tournament.endsAt]);

  const hasImage = !!(game.imageUrl || (game as any).thumbnail);

  return (
    <View style={styles.tournamentCard}>
      {/* Left banner — stretches to full card height */}
      {hasImage ? (
        <ImageBackground
          source={{ uri: game.imageUrl || (game as any).thumbnail }}
          style={[styles.tournamentBanner, { alignSelf: "stretch" }]}
          imageStyle={{ borderTopLeftRadius: 15, borderBottomLeftRadius: 15 }}
          resizeMode="cover"
        >
          <View style={styles.tournamentBannerOverlay} />
          <GameLogo game={game} size={44} radius={12} />
        </ImageBackground>
      ) : (
        <LinearGradient
          colors={
            (game.gradient?.length === 2
              ? game.gradient
              : ["#7C3AED", "#0891B2"]) as [string, string]
          }
          style={[styles.tournamentBanner, { alignSelf: "stretch" }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <GameLogo game={game} size={44} radius={12} />
        </LinearGradient>
      )}

      {/* Center info — vertically centered */}
      <View style={styles.tournamentInfo}>
        <Text style={styles.tournamentTitle} numberOfLines={1}>
          {tournament.title || game.name}
        </Text>
        <Text style={styles.tournamentMeta}>
          {tournament.playerCount}/{tournament.maxPlayers} players
        </Text>
        <Text style={styles.tournamentPrize}>
          🏆 {tournament.prizeXP?.toLocaleString() || 0} XP
        </Text>
        {timeLabel && (
          <View style={styles.tournamentTimeBadge}>
            <Ionicons name="time-outline" size={11} color={colors.primaryLight} />
            <Text style={styles.tournamentTimeText}>{timeLabel}</Text>
          </View>
        )}
      </View>

      {/* Right action — vertically centered */}
      <View style={styles.tournamentAction}>
        <TouchableOpacity onPress={tournament.isJoined ? onPlay : onJoin}>
          <LinearGradient
            colors={[colors.primary, colors.cyanDark]}
            style={styles.primaryButton}
          >
            <Ionicons
              name={tournament.isJoined ? "play" : "add"}
              size={14}
              color="#fff"
            />
            <Text style={styles.primaryButtonText}>
              {tournament.isJoined ? "PLAY" : "JOIN"}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}
