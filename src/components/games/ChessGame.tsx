import React, { useEffect, useState, useRef } from "react";
import {
  View,
  StyleSheet,
  Text,
  Dimensions,
  TouchableOpacity,
  Animated,
} from "react-native";
import { Chessboard, ChessboardRef } from "@crewbeat/expo-chessboard";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Chess } from "chess.js";
import { LinearGradient } from "expo-linear-gradient";
import { createGameEngineSocket } from "../../services/socketClient";
import type { HtmlGameResult } from "../../games/types";

const { width } = Dimensions.get("window");
const BOARD_SIZE = width - 24;

type Props = {
  matchId: string;
  userId: string;
  wsToken: string;
  onComplete: (result: HtmlGameResult) => void;
};

const EVENTS = {
  JOIN: "JOIN",
  READY: "READY",
  MOVE: "MOVE",
  CONNECT_ACK: "CONNECT",
  START: "START",
  STATE: "STATE",
  SYNC: "SYNC",
  GAME_OVER: "GAME_OVER",
  ERROR: "ERROR",
  PAUSE: "PAUSE",
};

type GameStatus = "connecting" | "waiting" | "active" | "finished" | "paused";

export default function ChessGame({
  matchId,
  userId,
  wsToken,
  onComplete,
}: Props) {
  const [chess] = useState(new Chess());
  const chessboardRef = useRef<ChessboardRef>(null);

  const [socket, setSocket] = useState<any>(null);
  const [status, setStatus] = useState<GameStatus>("connecting");
  const [playerColor, setPlayerColorState] = useState<"w" | "b">("w");
  const playerColorRef = useRef<"w" | "b">("w");

  const setPlayerColor = (color: "w" | "b") => {
    playerColorRef.current = color;
    setPlayerColorState(color);
  };

  const [opponentName, setOpponentName] = useState("Opponent");
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [moves, setMoves] = useState<{ w: string | null; b: string | null }>({
    w: null,
    b: null,
  });
  const [inCheck, setInCheck] = useState(false);
  const [captures, setCaptures] = useState<{ w: string[]; b: string[] }>({
    w: [],
    b: [],
  });
  const [timers, setTimers] = useState<{ w: number; b: number }>({
    w: 600000,
    b: 600000,
  });

  const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  const PIECE_ICONS: Record<string, string> = {
    p: "♟\uFE0E",
    n: "♞\uFE0E",
    b: "♝\uFE0E",
    r: "♜\uFE0E",
    q: "♛\uFE0E",
  };

  // Local timer countdown
  useEffect(() => {
    if (status !== "active") return;
    const interval = setInterval(() => {
      setTimers((prev) => {
        const activeColor = chess.turn();
        return {
          ...prev,
          [activeColor]: Math.max(0, prev[activeColor as "w" | "b"] - 1000),
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const checkAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation for "Your Turn"
  useEffect(() => {
    if (isMyTurn && status === "active") {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isMyTurn, status]);

  // Flash animation for check
  useEffect(() => {
    if (inCheck) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(checkAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: false,
          }),
          Animated.timing(checkAnim, {
            toValue: 0,
            duration: 400,
            useNativeDriver: false,
          }),
        ]),
        { iterations: 3 },
      ).start(() => setInCheck(false));
    }
  }, [inCheck]);

  // Ensure visual board is perfectly synced when returning to match
  // We now pass fen={chess.fen()} to Chessboard directly, so this reset is a backup.
  useEffect(() => {
    if (status === "active" || status === "finished") {
      const timer = setTimeout(() => {
        chessboardRef.current?.reset?.(chess.fen());
        // For compatibility with some react-native-chessboard versions
        (chessboardRef.current as any)?.resetBoard?.(chess.fen());
      }, 500); // Increased delay so it doesn't overlap with mount
      return () => clearTimeout(timer);
    }
  }, [status]);

  useEffect(() => {
    const s = createGameEngineSocket(matchId, userId, wsToken);
    setSocket(s);

    s.on(EVENTS.CONNECT_ACK, (data: any) => {
      const { state } = data;

      if (state.pluginState?.fen) {
        chess.load(state.pluginState.fen);
        chessboardRef.current?.reset(state.pluginState.fen);
      }

      let me: any = null;
      if (state.players) {
        me = state.players.find((p: any) => p.userId === userId);
        const opp = state.players.find((p: any) => p.userId !== userId);
        if (me?.color) setPlayerColor(me.color);
        if (opp) {
          setOpponentName(opp.username || opp.name || "Opponent");
        } else {
          setOpponentName("AI Bot");
        }
      }

      const isActive = state.status === "ACTIVE";
      const isPaused = state.status === "PAUSED";
      setStatus(isActive ? "active" : (isPaused ? "paused" : "waiting"));
      if (isActive || isPaused) updateTurnState(chess, me?.color || "w");
      if (state.pluginState?.timers) setTimers(state.pluginState.timers);
      if (state.pluginState?.moveHistory)
        updateCaptures(state.pluginState.moveHistory);
      s.emit(EVENTS.READY);
    });

    s.on(EVENTS.START, (data: any) => {
      setStatus("active");
      const ps = data.state?.pluginState ?? data.state;
      if (ps?.fen) {
        chess.load(ps.fen);
        chessboardRef.current?.reset(ps.fen);
      }
      if (ps?.timers) setTimers(ps.timers);
      if (ps?.moveHistory) {
        updateCaptures(ps.moveHistory);
        if (ps.moveHistory.length > 0) {
          const last = ps.moveHistory[ps.moveHistory.length - 1];
          setMoves((prev) => ({ ...prev, [last.color]: last.san }));
        }
      }
      updateTurnState(chess, playerColorRef.current);
    });

    s.on(EVENTS.SYNC, (data: any) => {
      const ps = data.state;
      if (ps?.fen) {
        chess.load(ps.fen);
        chessboardRef.current?.reset(ps.fen);

        // Detect check
        if (chess.inCheck()) setInCheck(true);

        if (ps.timers) setTimers(ps.timers);

        // Record last move
        const history = chess.history({ verbose: true });
        if (history.length > 0) {
          const last = history[history.length - 1];
          setMoves((prev) => ({ ...prev, [last.color]: last.san }));
        }

        if (ps.moveHistory) updateCaptures(ps.moveHistory);

        updateTurnState(chess, playerColorRef.current);
      }
    });

    s.on(EVENTS.GAME_OVER, (data: any) => {
      setStatus("finished");
      const ps = data.state?.pluginState ?? data.state?.pluginState;
      const winnerId = ps?.winner || data.winner;
      const isDraw = ps?.drawReason || data.drawReason;

      const won = winnerId === userId;
      const result: HtmlGameResult = {
        score: won ? 1 : 0,
        won,
        xpEarned: won ? 100 : isDraw ? 30 : 10,
        durationSeconds: 0,
      };

      // Show game-over overlay — handled in render
      setTimeout(() => onComplete(result), 3000);
    });

    s.on(EVENTS.PAUSE, () => {
      setStatus("paused");
    });

    s.on(EVENTS.ERROR, (error: any) => {
      console.warn("Chess socket error:", error);
    });

    return () => {
      s.disconnect();
    };
  }, [matchId, userId, wsToken]);

  const updateTurnState = (chessInstance: Chess, color: "w" | "b") => {
    setIsMyTurn(chessInstance.turn() === color);
  };

  const updateCaptures = (moveHistory: any[]) => {
    const wCaps: string[] = [];
    const bCaps: string[] = [];
    for (const move of moveHistory) {
      if (move.captured) {
        if (move.color === "w") wCaps.push(move.captured);
        else bCaps.push(move.captured);
      }
    }
    setCaptures({ w: wCaps, b: bCaps });
  };

  const onMove = (move: { from: string; to: string; promotion?: string }) => {
    if (status !== "active" || chess.turn() !== playerColor) {
      chessboardRef.current?.reset(chess.fen());
      return;
    }
    try {
      const moveObj: any = { from: move.from, to: move.to };
      if (move.promotion) moveObj.promotion = move.promotion;

      const result = chess.move(moveObj);
      if (!result) {
        chessboardRef.current?.reset(chess.fen());
        return;
      }

      // Track captures locally for immediate feedback
      if (result.captured) {
        setCaptures((prev) => ({
          ...prev,
          [playerColor]: [...prev[playerColor as "w" | "b"], result.captured],
        }));
      }

      setMoves((prev) => ({ ...prev, [playerColor]: result.san }));
      setIsMyTurn(false);
      socket?.emit(EVENTS.MOVE, moveObj);
    } catch {
      chessboardRef.current?.reset(chess.fen());
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const myColorName = playerColor === "w" ? "White" : "Black";
  const oppColorName = playerColor === "w" ? "Black" : "White";
  const oppColor = playerColor === "w" ? "b" : "w";

  const formatTime = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const getScore = (caps: string[]) =>
    caps.reduce((sum, p) => sum + (PIECE_VALUES[p] || 0), 0);
  const wScore = getScore(captures.w);
  const bScore = getScore(captures.b);

  const myScore = playerColor === "w" ? wScore : bScore;
  const oppScore = playerColor === "w" ? bScore : wScore;

  const myAdvantage = myScore > oppScore ? `+${myScore - oppScore}` : null;
  const oppAdvantage = oppScore > myScore ? `+${oppScore - myScore}` : null;

  const myCaps = playerColor === "w" ? captures.w : captures.b;
  const oppCaps = playerColor === "w" ? captures.b : captures.w;

  const renderCaptures = (caps: string[], advantage: string | null) => {
    if (caps.length === 0 && !advantage) return null;
    return (
      <View style={styles.captureRow}>
        <Text style={styles.captureIcons}>
          {caps.map((c) => PIECE_ICONS[c] || "").join("")}
        </Text>
        {advantage && <Text style={styles.captureAdvantage}>{advantage}</Text>}
      </View>
    );
  };

  if (status === "connecting") {
    return (
      <View style={styles.fullCenter}>
        <View style={styles.connectCard}>
          <Text style={styles.connectIcon}>♟️</Text>
          <Text style={styles.connectTitle}>Chess</Text>
          <Text style={styles.connectSub}>Connecting to match…</Text>
          <View style={styles.dotRow}>
            {[0, 1, 2].map((i) => (
              <WaitDot key={i} delay={i * 200} />
            ))}
          </View>
        </View>
      </View>
    );
  }

  if (status === "waiting") {
    return (
      <View style={styles.fullCenter}>
        <View style={styles.connectCard}>
          <Text style={styles.connectIcon}>⏳</Text>
          <Text style={styles.connectTitle}>Waiting for Opponent</Text>
          <Text style={styles.connectSub}>Finding your chess rival…</Text>
          <View style={styles.colorBadge}>
            <Text style={styles.colorBadgeText}>You play as {myColorName}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Opponent row */}
      <View style={styles.playerRow}>
        <View
          style={[
            styles.colorChip,
            { backgroundColor: playerColor === "w" ? "#1E293B" : "#F8FAFC" },
          ]}
        >
          <Text
            style={[
              styles.colorChipText,
              { color: playerColor === "w" ? "#94A3B8" : "#0F172A" },
            ]}
          >
            {oppColorName[0]}
          </Text>
        </View>

        <View style={styles.playerInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.playerName}>{opponentName}</Text>
            {moves[oppColor] && (
              <View style={styles.moveBadge}>
                <Text style={styles.moveBadgeText}>{moves[oppColor]}</Text>
              </View>
            )}
          </View>
          {renderCaptures(oppCaps, oppAdvantage)}
        </View>

        <View
          style={[
            styles.timerBadge,
            !isMyTurn && status === "active" && styles.timerActive,
          ]}
        >
          <Text
            style={[
              styles.timerText,
              !isMyTurn && status === "active" && styles.timerTextActive,
            ]}
          >
            {formatTime(timers[oppColor])}
          </Text>
        </View>
      </View>

      {/* Check warning */}
      {inCheck && (
        <Animated.View
          style={[
            styles.checkBanner,
            {
              backgroundColor: checkAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ["rgba(239,68,68,0)", "rgba(239,68,68,0.2)"],
              }),
            },
          ]}
        >
          <Text style={styles.checkText}>⚠️ CHECK!</Text>
        </Animated.View>
      )}

      {/* Board */}
      <View style={[styles.boardWrap, inCheck && styles.boardWrapCheck]}>
        <Chessboard
          ref={chessboardRef}
          fen={chess.fen()}
          onMove={onMove}
          boardSize={BOARD_SIZE}
          boardOrientation={playerColor === "w" ? "white" : "black"}
          playerSide={playerColor === "w" ? "white" : "black"}
          colors={{ dark: "#7C3AED", light: "#EDE9FE" }}
        />
      </View>

      {/* My row */}
      <View style={styles.playerRow}>
        <View
          style={[
            styles.colorChip,
            { backgroundColor: playerColor === "w" ? "#F8FAFC" : "#1E293B" },
          ]}
        >
          <Text
            style={[
              styles.colorChipText,
              { color: playerColor === "w" ? "#0F172A" : "#94A3B8" },
            ]}
          >
            {myColorName[0]}
          </Text>
        </View>

        <View style={styles.playerInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.playerName}>You</Text>
            {moves[playerColor] && (
              <View style={styles.moveBadge}>
                <Text style={styles.moveBadgeText}>{moves[playerColor]}</Text>
              </View>
            )}
          </View>
          {renderCaptures(myCaps, myAdvantage)}
        </View>

        <View
          style={[
            styles.timerBadge,
            isMyTurn && status === "active" && styles.timerActive,
          ]}
        >
          <Text
            style={[
              styles.timerText,
              isMyTurn && status === "active" && styles.timerTextActive,
            ]}
          >
            {formatTime(timers[playerColor])}
          </Text>
        </View>
      </View>

      {/* Game over overlay */}
      {status === "finished" && (
        <View style={styles.gameOverOverlay}>
          <View style={styles.gameOverCard}>
            <Text style={styles.gameOverIcon}>
              {chess.isCheckmate()
                ? chess.turn() !== playerColor
                  ? "🏆"
                  : "😢"
                : "🤝"}
            </Text>
            <Text style={styles.gameOverTitle}>
              {chess.isCheckmate()
                ? chess.turn() !== playerColor
                  ? "Checkmate! You Win!"
                  : "Checkmate! You Lose"
                : "Game Over"}
            </Text>
            <Text style={styles.gameOverSub}>Returning to lobby…</Text>
          </View>
        </View>
      )}
    </GestureHandlerRootView>
  );
}

function WaitDot({ delay }: { delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);
  return <Animated.View style={[styles.dot, { opacity: anim }]} />;
}

function ThinkingDots() {
  return (
    <View style={styles.thinkingRow}>
      {[0, 1, 2].map((i) => (
        <WaitDot key={i} delay={i * 200} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#05050F",
    paddingHorizontal: 12,
    paddingTop: 8,
    justifyContent: "center",
  },

  headerWrap: { alignItems: "center", paddingBottom: 16 },
  headerText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  fullCenter: {
    flex: 1,
    backgroundColor: "#05050F",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  connectCard: {
    backgroundColor: "#0F172A",
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "rgba(124,58,237,0.25)",
    minWidth: 260,
  },
  connectIcon: { fontSize: 52, marginBottom: 16 },
  connectTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#F8FAFC",
    marginBottom: 8,
  },
  connectSub: { fontSize: 14, color: "#64748B", marginBottom: 20 },
  colorBadge: {
    backgroundColor: "rgba(124,58,237,0.15)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.3)",
  },
  colorBadgeText: { color: "#A78BFA", fontWeight: "700", fontSize: 13 },

  dotRow: { flexDirection: "row", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#7C3AED" },

  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 10,
  },
  colorChip: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.1)",
  },
  colorChipText: { fontSize: 16, fontWeight: "900" },
  playerInfo: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  playerName: { fontSize: 15, fontWeight: "800", color: "#F8FAFC" },

  captureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  captureIcons: { fontSize: 16, color: "#A78BFA" },
  captureAdvantage: { fontSize: 11, color: "#34D399", fontWeight: "800" },

  timerBadge: {
    backgroundColor: "#1E293B",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  timerActive: {
    backgroundColor: "rgba(124,58,237,0.15)",
    borderColor: "rgba(124,58,237,0.5)",
  },
  timerText: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  timerTextActive: { color: "#F8FAFC" },

  moveBadge: {
    backgroundColor: "rgba(124,58,237,0.15)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.3)",
  },
  moveBadgeText: {
    color: "#A78BFA",
    fontSize: 10,
    fontWeight: "700",
    fontFamily: "monospace",
  },

  myTurnBadge: { borderRadius: 20, overflow: "hidden" },
  myTurnGradient: { paddingHorizontal: 14, paddingVertical: 7 },
  myTurnText: { color: "#FFF", fontWeight: "900", fontSize: 13 },

  checkBanner: {
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "rgba(239,68,68,0.5)",
  },
  checkText: {
    color: "#EF4444",
    fontWeight: "900",
    fontSize: 15,
    letterSpacing: 1,
  },

  boardWrap: {
    width: BOARD_SIZE,
    height: BOARD_SIZE,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(124,58,237,0.3)",
    alignSelf: "center",
  },
  boardWrapCheck: { borderColor: "#EF4444" },

  gameOverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,5,15,0.88)",
    justifyContent: "center",
    alignItems: "center",
  },
  gameOverCard: {
    backgroundColor: "#0F172A",
    borderRadius: 24,
    padding: 36,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(124,58,237,0.4)",
    minWidth: 260,
  },
  gameOverIcon: { fontSize: 64, marginBottom: 16 },
  gameOverTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#F8FAFC",
    textAlign: "center",
    marginBottom: 8,
  },
  gameOverSub: { fontSize: 13, color: "#64748B" },
});
