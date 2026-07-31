import React, { useEffect, useState, useRef } from "react";
import { View, StyleSheet, Text, TouchableOpacity, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { createGameEngineSocket } from "../../services/socketClient";
import type { HtmlGameResult } from "../../games/types";

const { width } = Dimensions.get("window");
const GRID_SIZE = width - 48;
const CELL_SIZE = (GRID_SIZE - 24) / 3;

type Props = {
  matchId: string;
  userId: string;
  wsToken: string;
  opponentName?: string;
  onComplete: (result: HtmlGameResult) => void;
};

const EVENTS = {
  CONNECT_ACK: "CONNECT",
  START: "START",
  STATE: "STATE",
  SYNC: "SYNC",
  GAME_OVER: "GAME_OVER",
  READY: "READY",
};

export default function MemoryGridGame({ matchId, userId, wsToken, opponentName, onComplete }: Props) {
  const [socket, setSocket] = useState<any>(null);
  const [status, setStatus] = useState<"connecting" | "waiting" | "active" | "finished">("connecting");
  const [roundPhase, setRoundPhase] = useState<"SHOW" | "INPUT">("SHOW");
  const [currentRound, setCurrentRound] = useState(0);
  const [score, setScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  
  const [pattern, setPattern] = useState<number[]>([]);
  const [activeCell, setActiveCell] = useState<number | null>(null);
  const [playerInputs, setPlayerInputs] = useState<number[]>([]);

  useEffect(() => {
    const s = createGameEngineSocket(matchId, userId, wsToken);
    setSocket(s);

    s.on(EVENTS.CONNECT_ACK, (payload: any) => {
      setStatus("waiting");
      s.emit(EVENTS.READY);
    });

    s.on(EVENTS.START, (payload: any) => {
      setStatus("active");
      if (payload.state?.pluginState) {
        syncState(payload.state.pluginState);
      }
    });

    s.on(EVENTS.SYNC, (payload: any) => {
      if (payload.state) {
        syncState(payload.state);
      }
    });

    s.on(EVENTS.GAME_OVER, (state: any) => {
      setStatus("finished");
      if (state.reward) {
        onComplete({
          score: state.reward.score || 0,
          won: state.reward.result === "WIN",
          xpEarned: state.reward.xpEarned || 0,
          durationSeconds: state.reward.duration || 30,
        });
      }
    });

    return () => {
      s.disconnect();
    };
  }, [matchId, userId, wsToken]);

  const syncState = (ps: any) => {
    if (ps.roundPhase) setRoundPhase(ps.roundPhase);
    if (ps.currentRound !== undefined) setCurrentRound(ps.currentRound);
    if (ps.scores) {
      setScore(ps.scores[userId] || 0);
      const oppId = Object.keys(ps.scores).find(id => id !== userId && !id.startsWith('bot_'));
      if (oppId) setOpponentScore(ps.scores[oppId]);
      const botId = Object.keys(ps.scores).find(id => id.startsWith('bot_'));
      if (botId && !oppId) setOpponentScore(ps.scores[botId]);
    }
    
    // Server sends full pattern in currentState in our updated plugin 
    // or we can extract it if it's there
    if (ps.currentPattern) {
      setPattern(ps.currentPattern);
    }
  };

  // Animate Pattern when in SHOW phase
  useEffect(() => {
    if (status !== "active" || roundPhase !== "SHOW" || pattern.length === 0) return;

    let isCancelled = false;
    let step = 0;

    const animate = async () => {
      // Small pause before starting
      await new Promise(r => setTimeout(r, 800));
      if (isCancelled) return;

      while (step < pattern.length) {
        setActiveCell(pattern[step]);
        await new Promise(r => setTimeout(r, 400));
        if (isCancelled) return;
        
        setActiveCell(null);
        await new Promise(r => setTimeout(r, 200));
        if (isCancelled) return;
        
        step++;
      }

      if (!isCancelled && socket) {
        socket.emit("MOVE", { type: "READY_INPUT" });
        setPlayerInputs([]);
      }
    };

    animate();

    return () => {
      isCancelled = true;
    };
  }, [status, roundPhase, pattern]);

  const handleCellTap = (index: number) => {
    if (status !== "active" || roundPhase !== "INPUT") return;
    
    // Flash cell
    setActiveCell(index);
    setTimeout(() => setActiveCell(null), 150);

    const newInputs = [...playerInputs, index];
    setPlayerInputs(newInputs);

    if (newInputs.length === pattern.length) {
      // Submit
      socket?.emit("MOVE", { type: "INPUT", tiles: newInputs });
      setRoundPhase("SHOW"); // Optimistic wait
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.vsContainer}>
          <View style={styles.playerSide}>
            <Text style={styles.playerName} numberOfLines={1}>You</Text>
            <Text style={styles.playerScore}>{score}</Text>
          </View>
          <View style={styles.vsBadge}>
            <Text style={styles.vsText}>VS</Text>
          </View>
          <View style={styles.playerSide}>
            <Text style={styles.playerName} numberOfLines={1}>{opponentName || "Opponent"}</Text>
            <Text style={styles.playerScore}>{opponentScore}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.messageText}>
        {status === "connecting" ? "Connecting..." : 
         status === "waiting" ? "Waiting..." :
         status === "finished" ? "Game Over" :
         roundPhase === "SHOW" ? "Watch the pattern!" : "Your turn!"}
      </Text>

      <View style={styles.grid}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => {
          const isActive = activeCell === index;
          return (
            <TouchableOpacity
              key={index}
              activeOpacity={0.8}
              onPress={() => handleCellTap(index)}
              style={[
                styles.cell,
                isActive && styles.cellActive
              ]}
            >
              {isActive && (
                <LinearGradient
                  colors={["#10B981", "#34D399"]}
                  style={StyleSheet.absoluteFillObject}
                />
              )}
            </TouchableOpacity>
          );
        })}
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
    width: GRID_SIZE,
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
  messageText: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 30,
    height: 30,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: GRID_SIZE,
    height: GRID_SIZE,
    justifyContent: "space-between",
    alignContent: "space-between",
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
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
});
