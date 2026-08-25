/**
 * TournamentCard — displays a tournament in a row-by-row layout.
 */
import React, { useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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

  return (
    <View style={styles.tournamentCard}>
      <GameLogo game={game} size={44} radius={12} />
      <View style={{ flex: 1 }}>
        <Text style={styles.tournamentTitle} numberOfLines={1}>
          {tournament.title || game.name}
        </Text>
        <Text style={styles.tournamentMeta}>
          {tournament.playerCount}/{tournament.maxPlayers} players
        </Text>
        <Text style={styles.tournamentPrize}>
          🏆 {tournament.prizeXP || 0} XP
        </Text>
      </View>
      <TouchableOpacity onPress={tournament.isJoined ? onPlay : onJoin}>
        <LinearGradient
          colors={[colors.primary, colors.cyanDark]}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>
            {tournament.isJoined ? "PLAY" : "JOIN"}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}
