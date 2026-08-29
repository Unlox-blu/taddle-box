/**
 * MatchRow — displays a single match in history.
 * Extracted from GamesScreen.tsx for modularity.
 */

import React, { useMemo } from "react";
import { View, Text } from "react-native";
import GameLogo from "./GameLogo";
import { useThemeColors } from "../../../context/ThemeContext";
import { makeStyles } from "../../../screens/main/GamesScreen.styles";

import type { GameMatch } from "../../../context/GamesContext";
import type { Game } from "../../../types";

export default function MatchRow({ match, isLast }: { match: GameMatch; isLast?: boolean }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isWin = match.result === "win";
  const isDraw = match.result === "draw";

  const logoGame: Game = {
    id: match.gameId,
    name: match.gameName,
    emoji: match.gameEmoji,
    gradient: ["#7C3AED", "#0891B2"] as [string, string],
    thumbnail: match.gameThumbnail,
    imageUrl: match.gameThumbnail,
    maxXp: 0,
    isHot: false,
  };

  return (
    <View style={[styles.matchRow, isLast && { borderBottomWidth: 0 }]}>
      <View style={styles.matchIcon}>
        <GameLogo game={logoGame} size={44} radius={11} />
      </View>
      <View style={styles.matchBody}>
        <Text style={styles.matchTitle}>{match.gameName}</Text>
        <Text style={styles.matchMeta}>
          {match.opponent} | {match.duration}
        </Text>
      </View>
      <View style={styles.matchRight}>
        <Text
          style={[
            styles.matchResult,
            { color: isWin ? colors.success : isDraw ? colors.text.secondary : colors.danger },
          ]}
        >
          {isWin ? "WIN" : isDraw ? "DRAW" : "LOSS"}
        </Text>
        <Text style={styles.matchXp}>+{match.xpEarned} XP</Text>
      </View>
    </View>
  );
}
