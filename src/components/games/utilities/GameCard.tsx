/**
 * GameCard — displays a game in the games grid.
 * Extracted from GamesScreen.tsx for modularity.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  ImageBackground,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import GameLogo from "./GameLogo";
import { useThemeColors } from "../../../context/ThemeContext";
import { makeStyles } from "../../../screens/main/GamesScreen.styles";
import type { Game } from "../../../types";

type BrandedButtonLoaderProps = {};

export default function GameCard({
  game,
  isRejoin,
  rejoinWindowMs,
  onPlayClick,
  onRejoinExpired,
}: {
  game: Game;
  isRejoin?: boolean;
  rejoinWindowMs?: number | null;
  onPlayClick: () => void;
  onRejoinExpired?: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState<number | null>(
    rejoinWindowMs != null ? Math.floor(rejoinWindowMs / 1000) : null,
  );

  const formatTime = (seconds: number) => {
    if (seconds >= 3600) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return `${h}h ${m}m`;
    }
    if (seconds >= 60) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}m ${s}s`;
    }
    return `${seconds}s`;
  };

  useEffect(() => {
    if (rejoinWindowMs != null && rejoinWindowMs > 0) {
      setTimeLeft(Math.floor(rejoinWindowMs / 1000));
    } else if (isRejoin) {
      // Backend should ALWAYS send reconnectWindowMs for PAUSED matches.
      // If it's null/0 the window has already expired or the session is stale.
      // Don't show a fake 60s countdown.
      setTimeLeft(null);
    } else {
      setTimeLeft(null);
    }
  }, [rejoinWindowMs, isRejoin]);

  useEffect(() => {
    if (!isRejoin || timeLeft === null || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft, isRejoin]);

  useEffect(() => {
    if (isRejoin && timeLeft === 0) {
      const t = setTimeout(() => onRejoinExpired?.(), 1200);
      return () => clearTimeout(t);
    }
  }, [isRejoin, timeLeft, onRejoinExpired]);

  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.gameCard}>
      {(game.imageUrl || (game as any).thumbnail) ? (
        <ImageBackground
          source={{ uri: game.imageUrl || (game as any).thumbnail }}
          style={styles.gameArt}
          resizeMode="cover"
        >
          {game.isHot && <View style={{ position: "absolute", top: 8, right: 8 }}><Text style={styles.gameBadge}>TRENDING</Text></View>}
        </ImageBackground>
      ) : (
        <LinearGradient
          colors={(game.gradient?.length === 2 ? game.gradient : ["#7C3AED", "#0891B2"]) as [string, string]}
          style={[styles.gameArt, { alignItems: "center", justifyContent: "center" }]}
        >
          <GameLogo game={game} size={64} radius={18} />
          {game.isHot && (
            <View style={{ position: "absolute", top: 8, right: 8 }}>
              <Text style={styles.gameBadge}>TRENDING</Text>
            </View>
          )}
        </LinearGradient>
      )}
      <View style={styles.gameBody}>
        <Text style={styles.gameTitle} numberOfLines={1}>
          {game.name}
        </Text>
        <Text style={styles.gameMeta}>Earn Up to {game.maxXp} XP</Text>

        <TouchableOpacity
          style={{ marginTop: 12 }}
          onPress={onPlayClick}
        >
          <LinearGradient
            colors={
              isRejoin
                ? [colors.warning, "#FF8C00"]
                : [colors.primary, colors.cyanDark]
            }
            style={styles.primaryButton}
          >
            {isRejoin ? (
              <Ionicons name="play-forward" size={16} color="#fff" />
            ) : (
              <Ionicons name="play" size={16} color="#fff" />
            )}
            <Text style={styles.primaryButtonText}>
              {isRejoin
                ? `REJOIN MATCH ${timeLeft && timeLeft > 0 ? `(${formatTime(timeLeft)})` : ""}`
                : `PLAY | ${game.entryFee || 0} XP`}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}
