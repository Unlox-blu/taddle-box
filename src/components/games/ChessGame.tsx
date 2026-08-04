import React, { useEffect, useState, useRef } from "react";
import {
  View,
  StyleSheet,
  Text,
  Dimensions,
  TouchableOpacity,
  Animated,
  Image,
} from "react-native";
import { Chessboard, ChessboardRef } from "@crewbeat/expo-chessboard";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Chess } from "chess.js";
import { LinearGradient } from "expo-linear-gradient";
import { createGameEngineSocket } from "../../services/socketClient";
import { gameSound, useTurnSound } from "../../services/gameSound";
import type { HtmlGameResult } from "../../games/types";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
// Board fits between the two player rows + safe-area, with a max cap
const BOARD_SIZE = Math.min(SCREEN_W - 24, Math.floor(SCREEN_H * 0.62), 400);

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
  /** Forwarded from GamePlayModal — "playing" means the 3-2-1 is done. */
  externalPhase?: ExternalPhase;
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

// Passed in from GamePlayModal — "playing" means the prestart screen is done.
type ExternalPhase = "waiting" | "playing";

export default function ChessGame({
  matchId,
  userId,
  wsToken,
  players,
  externalPhase,
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

  // START may arrive while the 3-2-1 countdown is still showing. Hold the
  // payload here and apply it only once externalPhase flips to "playing".
  const pendingStartRef = useRef<any>(null);
  // Mirror externalPhase in a ref so the socket closure (set up once on mount)
  // can always read the current value without going stale.
  const externalPhaseRef = useRef(externalPhase);
  useEffect(() => {
    externalPhaseRef.current = externalPhase;
  }, [externalPhase]);
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

  // Local timer countdown — only ticks once the countdown screen is gone
  // and the board is actually visible to prevent burning match time during 3-2-1.
  useEffect(() => {
    if (status !== "active" || externalPhase !== "playing") return;
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
  }, [status, externalPhase]);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const checkAnim = useRef(new Animated.Value(0)).current;

  // Turn-change sound + haptic when it becomes your turn
  useTurnSound(isMyTurn, status === "active");

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
      const ps = data.state?.pluginState ?? data.state;
      // Sync board state immediately regardless of phase.
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
      // If the countdown is already done, activate immediately.
      // Otherwise park the payload — the externalPhase effect will flush it.
      if (externalPhaseRef.current === "playing") {
        pendingStartRef.current = null;
        setStatus("active");
        updateTurnState(chess, playerColorRef.current);
      } else {
        pendingStartRef.current = data;
      }
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

    s.on(EVENTS.PAUSE, (data: any) => {
      setStatus("paused");
      // Bubble the reconnect window up so GamePlayModal shows the 60s overlay
      // with the opponent's name and countdown. The server always sends
      // reconnectWindowMs in the PAUSE payload.
      if (data?.reconnectWindowMs) {
        const { DeviceEventEmitter } = require('react-native');
        DeviceEventEmitter.emit('GAME_ENGINE_PAUSE', {
          matchId,
          data: { reconnectWindowMs: data.reconnectWindowMs },
        });
      }
    });

    s.on(EVENTS.ERROR, (error: any) => {
      console.warn("Chess socket error:", error);
    });

    return () => {
      s.disconnect();
    };
  }, [matchId, userId, wsToken]);

  // When the 3-2-1 countdown finishes (externalPhase flips to "playing"),
  // apply any pending START payload and activate the game clock.
  useEffect(() => {
    if (externalPhase !== "playing") return;
    if (pendingStartRef.current !== null) {
      const ps = pendingStartRef.current?.state?.pluginState
        ?? pendingStartRef.current?.state;
      // Only apply timers from START — do NOT reload the FEN from START,
      // because a SYNC from the bot's first move may have already updated
      // chess.js to the post-move position. Loading START's FEN here would
      // overwrite that and reset the board to the starting position.
      if (ps?.timers) setTimers(ps.timers);
      pendingStartRef.current = null;
    }
    // Always sync the board to the current chess.js state — covers:
    // 1. Bot moved during countdown (SYNC updated chess.js but board wasn't rendered)
    // 2. Normal START flush
    // 3. Rejoin (board already at correct FEN, reset is a no-op)
    // Use a small delay to ensure the Chessboard component has mounted
    // (status change → re-render → Chessboard mounts → ref becomes available).
    setTimeout(() => {
      chessboardRef.current?.reset?.(chess.fen());
      (chessboardRef.current as any)?.resetBoard?.(chess.fen());
    }, 150);
    setStatus((prev) =>
      prev === "finished" || prev === "paused" ? prev : "active"
    );
    updateTurnState(chess, playerColorRef.current);
  }, [externalPhase]);

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
      gameSound.playTap();
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

  const renderPlayerRow = ({
    isOpponent,
    label,
    avatarUri,
    colorKey,
    caps,
    advantage,
    time,
    isTurn,
  }: {
    isOpponent: boolean;
    label: string;
    avatarUri: string | null | undefined;
    colorKey: "w" | "b";
    caps: string[];
    advantage: string | null;
    time: number;
    isTurn: boolean;
  }) => {
    return (
      <View style={[styles.playerRow, isTurn && status === "active" && styles.playerRowActive]}>
        <View style={styles.avatarContainer}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: colorKey === "w" ? "#E2E8F0" : "#1E293B" }]}>
              <Text style={[styles.avatarFallbackText, { color: colorKey === "w" ? "#0F172A" : "#94A3B8" }]}>
                {(label || "?")[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View style={[styles.colorChipMini, { backgroundColor: colorKey === "w" ? "#F8FAFC" : "#1E293B" }]}>
            <Text style={[styles.colorChipTextMini, { color: colorKey === "w" ? "#0F172A" : "#94A3B8" }]}>
              {colorKey === "w" ? "W" : "B"}
            </Text>
          </View>
        </View>

        <View style={styles.playerInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.playerName} numberOfLines={1}>{label}</Text>
            {moves[colorKey] && (
              <View style={styles.moveBadge}>
                <Text style={styles.moveBadgeText}>{moves[colorKey]}</Text>
              </View>
            )}
          </View>
          {renderCaptures(caps, advantage)}
        </View>

        <View style={[styles.timerBadge, isTurn && status === "active" && styles.timerActive]}>
          <Text style={[styles.timerText, isTurn && status === "active" && styles.timerTextActive]}>
            {formatTime(time)}
          </Text>
        </View>
      </View>
    );
  };

  const myAvatarUri = (() => {
    const me = (players || []).find((p: any) => p.id === userId);
    return me?.avatar || null;
  })();
  const oppAvatarUri = (() => {
    const opp = (players || []).find((p: any) => p.id !== userId);
    return opp?.avatar || null;
  })();

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Opponent row (top) */}
      {renderPlayerRow({
        isOpponent: true,
        label: opponentName,
        avatarUri: oppAvatarUri,
        colorKey: oppColor,
        caps: oppCaps,
        advantage: oppAdvantage,
        time: timers[oppColor],
        isTurn: chess.turn() === oppColor && status === "active",
      })}

      {/* Board — the star of the screen */}
      <View style={[styles.boardWrap, inCheck && styles.boardWrapCheck]}>
        {inCheck && (
          <View style={styles.checkBanner}>
            <Text style={styles.checkText}>⚠ CHECK</Text>
          </View>
        )}
        <Chessboard
          ref={chessboardRef}
          fen={chess.fen()}
          boardSize={BOARD_SIZE}
          boardOrientation={playerColor === "w" ? "white" : "black"}
          playerSide={playerColor === "w" ? "white" : "black"}
          onMove={onMove}
        />
      </View>

      {/* My row (bottom) */}
      {renderPlayerRow({
        isOpponent: false,
        label: "You",
        avatarUri: myAvatarUri,
        colorKey: playerColor,
        caps: myCaps,
        advantage: myAdvantage,
        time: timers[playerColor],
        isTurn: isMyTurn && status === "active",
      })}

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
    <View style={styles.dotRow}>
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
    backgroundColor: "rgba(31, 41, 55, 0.5)",
    padding: 10,
    marginHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  playerRowActive: {
    borderColor: "rgba(124,58,237,0.6)",
    backgroundColor: "rgba(76,29,149,0.22)",
  },
  avatarContainer: {
    position: "relative",
    width: 40,
    height: 40,
    marginRight: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.1)",
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.1)",
  },
  avatarFallbackText: { fontSize: 16, fontWeight: "900" },
  colorChipMini: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#0F172A",
  },
  colorChipTextMini: {
    fontSize: 10,
    fontWeight: "900",
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


  boardWrap: {
    width: BOARD_SIZE + 8,
    height: BOARD_SIZE + 8,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(124,58,237,0.45)",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F172A",
    marginVertical: 10,
    elevation: 14,
    shadowColor: "#7C3AED",
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  boardWrapCheck: { borderColor: "#EF4444", shadowColor: "#EF4444" },
  checkBanner: {
    position: "absolute", top: 8, zIndex: 20,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5,
    backgroundColor: "rgba(239,68,68,0.9)",
    shadowColor: "#EF4444", shadowOpacity: 0.6, shadowRadius: 10,
  },
  checkText: { color: "#FFF", fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  gameOverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,5,15,0.88)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 50,
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
