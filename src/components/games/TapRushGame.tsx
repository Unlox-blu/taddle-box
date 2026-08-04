import React, { useEffect, useState, useRef } from "react";
import { View, StyleSheet, Text, TouchableOpacity, Dimensions, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { createGameEngineSocket } from "../../services/socketClient";
import { gameSound } from "../../services/gameSound";
import type { HtmlGameResult } from "../../games/types";

const { width, height } = Dimensions.get("window");
const GAME_AREA_WIDTH = width - 40;
const GAME_AREA_HEIGHT = GAME_AREA_WIDTH * 1.2;

export type PlayerContext = {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
  team?: number;
  seat?: number;
};

type Props = {
  matchId: string;
  userId: string;
  wsToken: string;
  players?: PlayerContext[];
  onComplete: (result: HtmlGameResult) => void;
};

type Target = {
  seq: number;
  x: number;
  y: number;
  delay: number;
};

const EVENTS = {
  CONNECT_ACK: "CONNECT",
  START: "START",
  STATE: "STATE",
  SYNC: "SYNC",
  GAME_OVER: "GAME_OVER",
  READY: "READY",
};

// How long an unrevealed target stays tappable before it counts as missed and
// disappears (keeps the field readable and prevents lingering/overlapping
// targets during fast reveals).
const TARGET_TTL_MS = 900;

// Reads the round duration (ms) from whatever field the engine state uses,
// falling back to 20s so the local timer always matches the server. The bare
// `duration` field is sometimes sent in seconds, so a sub-1000 value is
// treated as seconds to avoid a broken 3s round.
const readDurationMs = (state: any): number => {
  const ms =
    state?.pluginState?.roundDurationMs ??
    state?.roundDurationMs ??
    state?.durationMs ??
    state?.duration ??
    20000;
  const v = Number(ms) || 20000;
  return Math.max(3000, v < 1000 ? v * 1000 : v);
};

export default function TapRushGame({ matchId, userId, wsToken, players, onComplete }: Props) {
  const [socket, setSocket] = useState<any>(null);
  const [status, setStatus] = useState<"connecting" | "waiting" | "active" | "finished">("connecting");
  const [durationSec, setDurationSec] = useState(20);
  const [timeLeft, setTimeLeft] = useState(20);
  const [score, setScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [activeTarget, setActiveTarget] = useState<Target | null>(null);
  const [targetSequence, setTargetSequence] = useState<Target[]>([]);
  const lastTapSeqRef = useRef(-1);

  useEffect(() => {
    const s = createGameEngineSocket(matchId, userId, wsToken);
    setSocket(s);

    s.on(EVENTS.CONNECT_ACK, (payload: any) => {
      setStatus("waiting");
      if (payload.state?.pluginState?.targetSequence) {
        setTargetSequence(payload.state.pluginState.targetSequence);
      }
      setDurationSec(Math.round(readDurationMs(payload.state) / 1000));
      s.emit(EVENTS.READY);
    });

    s.on(EVENTS.START, (payload: any) => {
      setStatus("active");
      if (payload.state?.pluginState?.targetSequence) {
        setTargetSequence(payload.state.pluginState.targetSequence);
      }
      setDurationSec(Math.round(readDurationMs(payload.state) / 1000));
    });

    s.on(EVENTS.SYNC, (payload: any) => {
      if (payload.state?.scores) {
        setScore(payload.state.scores[userId] || 0);
        const oppId = Object.keys(payload.state.scores).find(id => id !== userId && !id.startsWith('bot_'));
        if (oppId) setOpponentScore(payload.state.scores[oppId]);
        const botId = Object.keys(payload.state.scores).find(id => id.startsWith('bot_'));
        if (botId && !oppId) setOpponentScore(payload.state.scores[botId]);
      }
    });

    s.on(EVENTS.GAME_OVER, (state: any) => {
      setStatus("finished");
      if (state.reward) {
        onComplete({
          score: state.reward.score || 0,
          won: state.reward.result === "WIN",
          xpEarned: state.reward.xpEarned || 0,
          durationSeconds: state.reward.duration || 20,
          // Score = successful taps; accuracy is hits vs total targets spawned
          accuracy: Math.min(100, Math.round(((state.reward.score || 0) / 15) * 100)),
          longestStreak: state.reward.score || 0,
        });
      } else {
        // Fallback: game ended (e.g. bot won), grab score from state
        const pState = state.state?.pluginState || state;
        const finalScore = pState.scores?.[userId] || 0;
        onComplete({
          score: finalScore,
          won: pState.winner === userId,
          xpEarned: 0,
          durationSeconds: 20,
          accuracy: Math.min(100, Math.round((finalScore / 15) * 100)),
          longestStreak: finalScore,
        });
      }
    });

    return () => {
      s.disconnect();
    };
  }, [matchId, userId, wsToken]);

  useEffect(() => {
    if (status !== "active") return;
    setTimeLeft(durationSec);
    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [status, durationSec]);

  useEffect(() => {
    if (status === "active" && timeLeft === 0) {
      setStatus("finished");
      onComplete({
        score,
        won: score >= 1, // basic win condition if at least 1 tap
        durationSeconds: 20,
        accuracy: Math.min(100, Math.round((score / 15) * 100)),
        longestStreak: score,
      });
    }
  }, [timeLeft, status, score, onComplete]);

  // Reveal targets on the server-provided cumulative schedule. Each target's
  // `delay` is its absolute offset from game start, so we schedule every reveal
  // once when the game goes active — no dependency on taps or score, meaning the
  // tap area keeps appearing for the full match instead of stalling/skipping.
  // Each target also auto-hides TARGET_TTL_MS after its reveal if not tapped,
  // so missed targets vanish instead of lingering under the next one.
  useEffect(() => {
    if (status !== "active" || targetSequence.length === 0) return;

    const timers: NodeJS.Timeout[] = [];
    targetSequence.forEach((t) => {
      timers.push(
        setTimeout(() => setActiveTarget(t), t.delay)
      );
      timers.push(
        setTimeout(() => {
          setActiveTarget((prev) => (prev?.seq === t.seq ? null : prev));
        }, t.delay + TARGET_TTL_MS)
      );
    });
    // Hide the last target shortly after the final reveal
    const lastDelay = targetSequence[targetSequence.length - 1]?.delay || 0;
    timers.push(setTimeout(() => setActiveTarget(null), lastDelay + TARGET_TTL_MS + 200));

    return () => timers.forEach(clearTimeout);
  }, [status, targetSequence]);

  const handleTap = () => {
    if (!activeTarget || !socket || status !== "active") return;

    const seq = activeTarget.seq;
    // Guard against double-tapping the same target (rapid taps emit the same
    // seq twice, the second gets rejected server-side and desyncs the score).
    if (seq === lastTapSeqRef.current) return;
    lastTapSeqRef.current = seq;

    // Optimistic UI update
    setScore(s => s + 1);
    setActiveTarget(null);
    
    socket.emit("MOVE", { type: "TAP", seq, clientTs: Date.now() });
    gameSound.playTap();
  };

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
                  ? { uri: players[0].avatar }
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
          {status === "connecting" || status === "waiting" ? (
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
