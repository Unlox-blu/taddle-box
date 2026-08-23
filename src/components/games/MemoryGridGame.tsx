import React, { useEffect, useState, useRef } from "react";
import { View, StyleSheet, Text, TouchableOpacity, Dimensions, Animated } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { createGameEngineSocket } from "../../services/accountSocketClient";
import { gameSound } from "../../services/gameSound";
import type { HtmlGameResult } from "../../games/types";
import { getSessionAvatar } from "../../services/sessionAvatarCache";

const { width } = Dimensions.get("window");
const GRID_SIZE = width - 48;
const CELL_SIZE = (GRID_SIZE - 24) / 3;

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
  /** Mirrors the GamePlayModal phase — the pattern SHOW animation only runs
      once the 3-2-1 countdown finishes, so reveals never happen off-screen. */
  externalPhase?: "playing" | "waiting";
  onComplete: (result: HtmlGameResult) => void;
};

const EVENTS = {
  CONNECT_ACK: "CONNECT",
  START: "START",
  STATE: "STATE",
  SYNC: "SYNC",
  GAME_OVER: "GAME_OVER",
  READY: "READY",
  ERROR: "ERROR",
};

export default function MemoryGridGame({
  matchId, userId, wsToken, players,
  externalPhase = "waiting",
  onComplete,
}: Props) {
  const [socket, setSocket] = useState<any>(null);
  const [status, setStatus] = useState<"connecting" | "waiting" | "active" | "finished">("connecting");
  const [roundPhase, setRoundPhase] = useState<"SHOW" | "INPUT">("SHOW");
  const [currentRound, setCurrentRound] = useState(0);
  const [score, setScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  
  const [pattern, setPattern] = useState<number[]>([]);
  const [activeCell, setActiveCell] = useState<number | null>(null);
  const [playerInputs, setPlayerInputs] = useState<number[]>([]);
  const [totalRounds, setTotalRounds] = useState(1);
  const totalRoundsRef = useRef(1);
  // Refs keep tap handling race-free (rapid taps must not lose taps) and
  // prevent duplicate INPUT/READY_INPUT submissions across re-renders.
  const inputsRef = useRef<number[]>([]);
  const submittedRef = useRef(false);
  const lastRoundRef = useRef(-1);
  const prevPhaseRef = useRef("SHOW");
  const patternKeyRef = useRef("");
  const wrongAnim = useRef(new Animated.Value(0)).current;
  // The engine only fires START after every player's board is visible — READY
  // is sent once the 3-2-1 countdown finishes (externalPhase "playing"), never
  // on connect, or the pattern reveal would run behind the countdown and bots
  // would play before the player can see the board.
  const readySentRef = useRef(false);
  // Bumped on every CONNECT_ACK so a reconnect during the waiting phase
  // re-arms READY (the server drops the player from readyPlayers on
  // disconnect — without re-sending, the match would never start).
  const [readyTick, setReadyTick] = useState(0);

  useEffect(() => {
    const s = createGameEngineSocket(matchId, userId, wsToken);
    setSocket(s);

    s.on(EVENTS.CONNECT_ACK, (payload: any) => {
      // Rejoining an already-ACTIVE match must not drop us back into the
      // "Waiting…" state — the engine skips READY→START for live matches, so
      // we'd deadlock on the loading screen forever. Adopt the server state.
      const matchStatus = payload?.status || payload?.state?.status;
      setStatus(matchStatus === "ACTIVE" ? "active" : "waiting");
      if (payload.state?.pluginState) {
        syncState(payload.state.pluginState);
      }
      // Reconnect (or fresh join) — re-arm the READY gate.
      readySentRef.current = false;
      setReadyTick((t) => t + 1);
    });

    s.on(EVENTS.STATE, (payload: any) => {
      // Room-wide STATE broadcasts (e.g. another player joined while waiting)
      // carry the full match snapshot — keep the board in sync.
      if (payload.state?.pluginState) {
        syncState(payload.state.pluginState);
      }
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

    s.on(EVENTS.ERROR, (e: any) => {
      // Server rejected a move — unlock the grid so the player can retry once
      // the SYNC lands. Shake only for genuine wrong answers (the server sends
      // a message on an incorrect sequence); benign phase races (stale
      // READY_INPUT / INPUT) must NOT look like a mistake.
      submittedRef.current = false;
      inputsRef.current = [];
      setPlayerInputs([]);
      const msg = String(e?.message || '').toLowerCase();
      const looksWrong =
        msg.includes('wrong') ||
        msg.includes('incorrect') ||
        msg.includes('does not match') ||
        msg.includes('invalid sequence') ||
        msg.includes('mismatch');
      // A rejection received while in INPUT phase IS a wrong answer — shake
      // regardless of how the server words the error. Rejections during SHOW
      // are benign phase races (stale READY_INPUT) and must not look like a
      // mistake.
      if (looksWrong || prevPhaseRef.current === 'INPUT') {
        triggerWrongShake();
      }
    });

    s.on(EVENTS.GAME_OVER, (payload: any) => {
      setStatus("finished");
      if (payload.reward) {
        const finalScore = payload.reward.score || 0;
        const maxRounds = totalRoundsRef.current || 1;
        onComplete({
          score: finalScore,
          won: payload.reward.result === "WIN",
          xpEarned: payload.reward.xpEarned || 0,
          durationSeconds: payload.reward.duration || 30,
          // Score = rounds memorized correctly out of the total rounds
          accuracy: Math.min(100, Math.round((finalScore / maxRounds) * 100)),
          longestStreak: finalScore,
        });
      } else {
        const pState = payload.state?.pluginState || payload;
        const finalScore = pState.scores?.[userId] || 0;
        // Prefer the server's winner field. Only fall back to a heuristic when
        // the server omits both reward and winner (legacy engine).
        onComplete({
          score: finalScore,
          won: pState.winner != null ? pState.winner === userId : finalScore >= 1,
          xpEarned: 0,
          durationSeconds: 30,
          accuracy: Math.min(100, Math.round((finalScore / (totalRoundsRef.current || 1)) * 100)),
          longestStreak: finalScore,
        });
      }
    });

    return () => {
      s.disconnect();
    };
  }, [matchId, userId, wsToken]);

  const syncState = (ps: any) => {
    if (ps.roundPhase) {
      setRoundPhase(ps.roundPhase);
      // SHOW → INPUT transition: the READY_INPUT was already sent (submittedRef
      // was set true when the animation ended), so unlock the grid for taps.
      // Only unlock on the actual transition — NOT on every INPUT-phase SYNC,
      // or a player could re-tap after submitting while the server waits for
      // the bot and overwrite a correct answer with a wrong one.
      if (ps.roundPhase === 'INPUT' && prevPhaseRef.current === 'SHOW') {
        submittedRef.current = false;
      }
      if (ps.roundPhase !== prevPhaseRef.current) {
        prevPhaseRef.current = ps.roundPhase;
      }
    }
    if (ps.currentRound !== undefined) {
      // A new round means a fresh pattern — reset local input tracking exactly
      // once per round so stale taps from the previous round never linger.
      if (ps.currentRound !== lastRoundRef.current) {
        lastRoundRef.current = ps.currentRound;
        inputsRef.current = [];
        submittedRef.current = false;
        setPlayerInputs([]);
      }
      setCurrentRound(ps.currentRound);
    }
    if (ps.scores) {
      setScore(ps.scores[userId] || 0);
      const oppId = Object.keys(ps.scores).find(id => id !== userId && !id.startsWith('bot_'));
      if (oppId) setOpponentScore(ps.scores[oppId]);
      const botId = Object.keys(ps.scores).find(id => id.startsWith('bot_'));
      if (botId && !oppId) setOpponentScore(ps.scores[botId]);
    }
    
    // Server sends full pattern in currentState in our updated plugin 
    // or we can extract it if it's there
    // Only replace the pattern when the ROUND actually changed (the SHOW
    // animation effect keys off `pattern`, so re-setting the same array on
    // every SYNC used to replay the whole animation and double-fire
    // READY_INPUT). Keying on currentRound guarantees each new round replays
    // its SHOW animation even if the server sends an identical pattern twice
    // in a row — otherwise that round would be unwinnable (blind INPUT).
    if (ps.currentPattern) {
      const key = `${ps.currentRound ?? "r"}:${ps.currentPattern.join(",")}`;
      if (key !== patternKeyRef.current) {
        patternKeyRef.current = key;
        setPattern(ps.currentPattern);
      }
    }
    if (ps.totalRounds) {
      setTotalRounds(ps.totalRounds);
      totalRoundsRef.current = ps.totalRounds;
    }
  };

  // Send READY the moment the board is actually visible (after the 3-2-1).
  useEffect(() => {
    if (externalPhase !== "playing" || readySentRef.current || !socket) return;
    readySentRef.current = true;
    socket.emit(EVENTS.READY);
  }, [externalPhase, socket, readyTick]);

  // Wrong-answer / rejected-move feedback: shake the board horizontally.
  const triggerWrongShake = () => {
    gameSound.playError();
    wrongAnim.setValue(0);
    Animated.sequence([
      Animated.timing(wrongAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(wrongAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(wrongAnim, { toValue: 7, duration: 50, useNativeDriver: true }),
      Animated.timing(wrongAnim, { toValue: -7, duration: 50, useNativeDriver: true }),
      Animated.timing(wrongAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  // Animate Pattern when in SHOW phase — but only once the board is actually
  // visible (externalPhase "playing"). Otherwise the reveal would run behind
  // the 3-2-1 countdown and the INPUT phase could already be active when the
  // player first sees the board.
  useEffect(() => {
    if (status !== "active" || externalPhase !== "playing" || roundPhase !== "SHOW" || pattern.length === 0) return;

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
        // Exactly one READY_INPUT per round — the ref guard prevents a re-run
        // of this effect (e.g. from a pattern state update) from double-firing.
        if (!submittedRef.current) {
          submittedRef.current = true;
          socket.emit("MOVE", { type: "READY_INPUT" });
        }
        inputsRef.current = [];
        setPlayerInputs([]);
      }
    };

    animate();

    return () => {
      isCancelled = true;
    };
  }, [status, externalPhase, roundPhase, pattern]);

  const handleCellTap = (index: number) => {
    if (status !== "active" || roundPhase !== "INPUT" || submittedRef.current) return;

    // Flash cell
    setActiveCell(index);
    setTimeout(() => setActiveCell(null), 150);

    // Use a ref so rapid taps never read stale state (which used to drop taps
    // and leave the input never reaching pattern.length).
    const newInputs = [...inputsRef.current, index];
    inputsRef.current = newInputs;
    setPlayerInputs(newInputs);

    if (newInputs.length === pattern.length) {
      // Submit — wait for the server SYNC (no optimistic phase flip, which
      // used to double-fire READY_INPUT / fight the server's roundPhase).
      submittedRef.current = true;
      socket?.emit("MOVE", { type: "INPUT", tiles: newInputs });
      gameSound.playCorrect();
    } else {
      gameSound.playTap();
    }
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
                  ? { uri: getSessionAvatar(players[0].avatar) }
                  : require("../../../assets/icon.png")
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
        style={[styles.grid, { transform: [{ translateX: wrongAnim }] }]}
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
                isActive && styles.cellActive,
                isPicked && styles.cellPicked,
              ]}
            >
              {(isActive || isPicked) && (
                <LinearGradient
                  colors={isPicked ? ["#7C3AED", "#A855F7"] : ["#10B981", "#34D399"]}
                  style={StyleSheet.absoluteFillObject}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </Animated.View>
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
  cellPicked: {
    borderColor: "#A855F7",
    shadowColor: "#A855F7",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 5,
  },
});
