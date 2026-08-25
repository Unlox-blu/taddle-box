/**
 * TapRushGame — pure renderer.
 *
 * Receives all game state + callbacks from TapRushRuntime via props.
 * No socket. No game logic. Pure pixels.
 *
 * Backend owns truth 🔐. TapRushRuntime owns connection 🔌.
 * TapRushGame owns visuals 🎨.
 */

import React from "react";
import { View, StyleSheet, Text, TouchableOpacity, Dimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import type { HtmlGameResult, PlayerContext } from "../../../../games/types";
import { getSessionAvatar } from "../../../../services/sessionAvatarCache";

const { width } = Dimensions.get("window");
const GAME_AREA_WIDTH = width - 40;
const GAME_AREA_HEIGHT = GAME_AREA_WIDTH * 1.2;

type Target = {
  seq: number;
  x: number;
  y: number;
  delay: number;
};

type Props = {
  matchId: string;
  userId: string;
  players?: PlayerContext[];
  externalPhase?: "playing" | "waiting";
  onComplete: (result: HtmlGameResult) => void;
  // Game state (from TapRushRuntime)
  status: "connecting" | "waiting" | "active" | "finished";
  durationSec: number;
  timeLeft: number;
  score: number;
  opponentScore: number;
  activeTarget: Target | null;
  targetSequence: Target[];
  // Actions
  handleTap: () => void;
  isMyTurn: boolean;
};

export default function TapRushGame({
  matchId,
  userId,
  players,
  externalPhase = "waiting",
  onComplete,
  status,
  durationSec,
  timeLeft,
  score,
  opponentScore,
  activeTarget,
  targetSequence,
  handleTap,
  isMyTurn,
}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.vsContainer}>
          <View style={styles.playerSide}>
            <Image
              source={require("../../../assets/icon.png")}
              style={styles.avatar}
            />
            <Text style={styles.playerName} numberOfLines={1}>You</Text>
            <Text style={styles.playerScore}>{score}</Text>
          </View>
          <View style={styles.vsBadge}>
            <Text style={styles.vsText}>VS</Text>
          </View>
          <View style={styles.playerSide}>
            <Image
              source={
                players?.[0]?.avatar
                  ? { uri: getSessionAvatar(players[0].avatar) }
                  : require("../../../assets/icon.png")
              }
              style={styles.avatar}
            />
            <Text style={styles.playerName} numberOfLines={1}>{players?.[0]?.name || "Opponent"}</Text>
            <Text style={styles.playerScore}>{opponentScore}</Text>
          </View>
        </View>

        <View style={styles.timeContainer}>
          <LinearGradient
            colors={timeLeft <= 5 ? ["#EF4444", "#991B1B"] : ["#10B981", "#059669"]}
            style={styles.timeGradient}
          >
            <Ionicons name="timer-outline" size={18} color="#fff" />
            <Text style={styles.timeValue}>{timeLeft}s</Text>
          </LinearGradient>
        </View>
      </View>

      <View style={styles.gameAreaWrapper}>
        <LinearGradient colors={["#1E1B4B", "#312E81"]} style={styles.gameArea}>
          {status === "connecting" || status === "waiting" || externalPhase !== "playing" ? (
            <Text style={styles.overlayText}>Get Ready...</Text>
          ) : status === "finished" ? (
            <Text style={styles.overlayText}>Game Over!</Text>
          ) : activeTarget ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleTap}
              style={[
                styles.target,
                {
                  left: `${activeTarget.x}%`,
                  top: `${activeTarget.y}%`,
                },
              ]}
            >
              <LinearGradient colors={["#8B5CF6", "#C084FC"]} style={styles.targetInner} />
            </TouchableOpacity>
          ) : null}
        </LinearGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  header: {
    width: GAME_AREA_WIDTH,
    marginBottom: 20,
  },
  vsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(31, 41, 55, 0.7)",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  playerSide: {
    flex: 1,
    alignItems: "center",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginBottom: 6,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.2)",
  },
  playerName: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  playerScore: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "900",
  },
  vsBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 16,
  },
  vsText: {
    color: "#F59E0B",
    fontSize: 12,
    fontWeight: "900",
  },
  timeContainer: {
    alignItems: "center",
    marginTop: 16,
  },
  timeGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  timeValue: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
  },
  gameAreaWrapper: {
    width: GAME_AREA_WIDTH,
    height: GAME_AREA_HEIGHT,
    borderRadius: 24,
    padding: 4,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  gameArea: {
    flex: 1,
    borderRadius: 20,
    overflow: "hidden",
    position: "relative",
  },
  target: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    marginLeft: -30,
    marginTop: -30,
    padding: 4,
    backgroundColor: "rgba(139, 92, 246, 0.3)",
  },
  targetInner: {
    flex: 1,
    borderRadius: 30,
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 5,
  },
  overlayText: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: GAME_AREA_HEIGHT / 2 - 20,
  },
});
