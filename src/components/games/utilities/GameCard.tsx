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
import { BlurView } from "expo-blur";
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

  const bgImage = game.metadata?.cardUrl || game.imageUrl || (game as any).thumbnail;
  const gradientColors = (game.gradient?.length === 2 ? game.gradient : ["#7C3AED", "#0891B2"]) as [string, string];

  return (
    <View style={[localStyles.cardContainer, { borderColor: colors.border, backgroundColor: colors.bg.card }]}>
      {/* Top Banner (Image or Gradient) */}
      <View style={localStyles.bannerContainer}>
        {bgImage ? (
          <ImageBackground source={{ uri: bgImage }} style={localStyles.bannerImage} resizeMode="cover" />
        ) : (
          <LinearGradient colors={gradientColors} style={localStyles.bannerImage} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        )}
        
        {/* Trending Badge Top Right */}
        {game.isHot && (
          <View style={[localStyles.trendingBadge, { backgroundColor: colors.primary }]}>
            <Text style={localStyles.trendingText}>HOT</Text>
          </View>
        )}
      </View>

      {/* Bottom Content Area */}
      <View style={localStyles.contentContainer}>
        
        {/* Overlapping Logo */}
        <View style={[localStyles.logoWrapper, { backgroundColor: colors.bg.card, borderColor: colors.border }]}>
          <GameLogo game={game} size={50} radius={14} />
        </View>

        <View style={localStyles.textContainer}>
          <Text style={[localStyles.title, { color: colors.text.primary }]} numberOfLines={1}>
            {game.name}
          </Text>
          <Text style={[localStyles.meta, { color: colors.text.secondary }]}>
            Up to {game.maxXp} XP
          </Text>
        </View>

        {/* Play Button */}
        <TouchableOpacity style={localStyles.buttonWrapper} onPress={onPlayClick} activeOpacity={0.85}>
          <LinearGradient
            colors={isRejoin ? [colors.warning, "#F59E0B"] : [colors.primary, colors.cyanDark]}
            style={localStyles.actionBtn}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Ionicons name={isRejoin ? "play-forward" : "play"} size={14} color="#fff" />
            <Text style={localStyles.actionBtnText}>
              {isRejoin 
                ? (timeLeft != null && timeLeft > 0 ? `REJOIN (${formatTime(timeLeft)})` : "REJOIN")
                : `PLAY  •  ${game.entryFee || 0} XP`}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  cardContainer: {
    width: "100%",
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  bannerContainer: {
    height: 85,
    width: "100%",
    position: "relative",
  },
  bannerImage: {
    width: "100%",
    height: "100%",
  },
  trendingBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  trendingText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  contentContainer: {
    paddingHorizontal: 12,
    paddingBottom: 14,
    alignItems: "center",
  },
  logoWrapper: {
    marginTop: -25, // Pulls the logo up into the banner
    padding: 3,
    borderRadius: 17, // 14 + 3
    borderWidth: 1,
    marginBottom: 8,
  },
  textContainer: {
    alignItems: "center",
    marginBottom: 12,
    width: "100%",
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 2,
  },
  meta: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  buttonWrapper: {
    width: "100%",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
