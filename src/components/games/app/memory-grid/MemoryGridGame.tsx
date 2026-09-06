/**
 * MemoryGridGame — pure renderer.
 *
 * Receives all game state + callbacks from MemoryGridRuntime via props.
 * No socket. No game logic. Pure pixels.
 */

import React from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Image, Animated, Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { HtmlGameResult, PlayerContext } from "../../../../games/types";
import { getSessionAvatar } from "../../../../services/sessionAvatarCache";
import { useGameContainer } from "../../../../games/useGameContainer";

const { width, height } = Dimensions.get("window");
const FALLBACK_GRID = width - 60;
const FALLBACK_CELL = (FALLBACK_GRID - 20) / 3;

type Props = {
  matchId: string;
  userId: string;
  players?: PlayerContext[];
  externalPhase?: "playing" | "waiting";
  onComplete: (result: HtmlGameResult) => void;
  // Game state (from MemoryGridRuntime)
  status: "connecting" | "waiting" | "active" | "finished";
  roundPhase: "SHOW" | "INPUT";
  currentRound: number;
  score: number;
  opponentScore: number;
  pattern: number[];
  activeCell: number | null;
  playerInputs: number[];
  totalRounds: number;
  wrongAnim: Animated.Value;
  // Actions
  handleCellTap: (index: number) => void;
  isMyTurn: boolean;
};

export default function MemoryGridGame({
  matchId,
  userId,
  players,
  externalPhase = "waiting",
  onComplete,
  status,
  roundPhase,
  currentRound,
  score,
  opponentScore,
  pattern,
  activeCell,
  playerInputs,
  totalRounds,
  wrongAnim,
  handleCellTap,
  isMyTurn,
}: Props) {
  const NATURAL_W = width;
  const NATURAL_H = height - 60;
  const { onLayout, scale, scaledMarginV } = useGameContainer({ naturalWidth: NATURAL_W, naturalHeight: NATURAL_H, paddingX: 60 });
  const GRID_SIZE = FALLBACK_GRID;
  const CELL_SIZE = FALLBACK_CELL;
  return (
    <View style={styles.container} onLayout={onLayout}>
      <View style={{ width: NATURAL_W, height: NATURAL_H, transform: [{ scale }], alignSelf: "center", marginVertical: scaledMarginV }}>
      <View style={[styles.header, { width: GRID_SIZE }]}>
        <View style={styles.vsContainer}>
          <View style={styles.playerSide}>
            <Image
              source={require("../../../../../assets/icon.png")}
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
                  : require("../../../../../assets/icon.png")
              }
              style={styles.avatar}
            />
            <Text style={styles.playerName} numberOfLines={1}>{players?.[0]?.name || "Opponent"}</Text>
            <Text style={styles.playerScore}>{opponentScore}</Text>
          </View>
        </View>
      </View>

      <View style={styles.roundRow}>
        <View style={styles.roundBadge}>
          <Text style={styles.roundBadgeText}>ROUND {Math.max(currentRound, 1)}{totalRounds ? ` / ${totalRounds}` : ""}</Text>
        </View>
        <Text style={styles.messageText}>
          {status === "connecting" ? "Connecting..." :
           status === "waiting" ? "Waiting..." :
           status === "finished" ? "Game Over" :
           roundPhase === "SHOW" ? "Watch the pattern! 👀" : "Your turn! 🧠"}
        </Text>
      </View>

      <Animated.View
        style={[styles.grid, { width: GRID_SIZE, height: GRID_SIZE, transform: [{ translateX: wrongAnim }] }]}
        onLayout={onLayout}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => {
          const isActive = activeCell === index;
          const isPicked = playerInputs.includes(index);
          return (
            <TouchableOpacity
              key={index}
              activeOpacity={0.8}
              onPress={() => handleCellTap(index)}
              style={[
                styles.cell,
                { width: CELL_SIZE, height: CELL_SIZE },
                isActive && styles.cellActive,
                isPicked && styles.cellPicked,
              ]}
            >
              {(isActive || isPicked) && (
                <LinearGradient
                  colors={isPicked ? ["#7C3AED", "#A855F7"] : ["#10B981", "#34D399"]}
                  style={StyleSheet.absoluteFill}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </Animated.View>
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
    width: FALLBACK_GRID,
    marginBottom: 40,
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
  roundRow: {
    alignItems: "center",
    marginBottom: 14,
    gap: 10,
  },
  roundBadge: {
    backgroundColor: "rgba(124,58,237,0.15)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.3)",
  },
  roundBadgeText: {
    color: "#A78BFA",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  messageText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    height: 26,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: FALLBACK_GRID,
    height: FALLBACK_GRID,
    justifyContent: "space-between",
    alignContent: "space-between",
  },
  cell: {
    width: FALLBACK_CELL,
    height: FALLBACK_CELL,
    backgroundColor: "rgba(31, 41, 55, 0.8)",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.05)",
    overflow: "hidden",
  },
  cellActive: {
    borderColor: "#10B981",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 5,
  },
  cellPicked: {
    borderColor: "#A855F7",
    shadowColor: "#A855F7",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 5,
  },
});
