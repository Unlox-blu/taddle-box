/**
 * ChessGame — pure renderer.
 *
 * Receives all game state + callbacks from ChessRuntime via props.
 * No socket. No game logic. Pure pixels.
 */

import React, { useEffect, useRef } from "react";
import {
  View, StyleSheet, Text, Dimensions, Animated, Image,
} from "react-native";
import { Chessboard, ChessboardRef } from "@crewbeat/expo-chessboard";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Chess } from "chess.js";
import type { HtmlGameResult, PlayerContext } from "../../../../games/types";
import { useGameContainer } from "../../../../games/useGameContainer";

// Responsive board size — computed from the container, not fixed at module level.
// Falls back to the old static formula for the initial render before onLayout fires.
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const FALLBACK_BOARD = Math.min(SCREEN_W - 24, Math.floor(SCREEN_H * 0.62), 400);

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const PIECE_ICONS: Record<string, string> = {
  p: "♟\uFE0E", n: "♞\uFE0E", b: "♝\uFE0E", r: "♜\uFE0E", q: "♛\uFE0E",
};

type GameStatus = "connecting" | "waiting" | "active" | "finished" | "paused";

type Props = {
  matchId: string;
  userId: string;
  players?: PlayerContext[];
  externalPhase?: "waiting" | "playing";
  onComplete: (result: HtmlGameResult) => void;
  // Game state (from ChessRuntime)
  status: GameStatus;
  chess: Chess;
  playerColor: "w" | "b";
  opponentName: string;
  isMyTurn: boolean;
  moves: { w: string | null; b: string | null };
  inCheck: boolean;
  captures: { w: string[]; b: string[] };
  timers: { w: number; b: number };
  // Actions
  onMove: (move: { from: string; to: string; promotion?: string }) => void;
};

const formatTime = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
};

const getScore = (caps: string[]) =>
  caps.reduce((sum, p) => sum + (PIECE_VALUES[p] || 0), 0);

export default function ChessGame({
  matchId,
  userId,
  players,
  externalPhase,
  onComplete,
  status,
  chess,
  playerColor,
  opponentName,
  isMyTurn,
  moves,
  inCheck,
  captures,
  timers,
  onMove,
}: Props) {
  // The game renders at its natural size and is uniformly scaled down when
  // the container shrinks (keyboard/chat opening). Everything shrinks together.
  const NATURAL_BOARD = Math.min(SCREEN_W - 24, Math.floor(SCREEN_H * 0.62), 400);
  const NATURAL_W = SCREEN_W;
  const NATURAL_H = SCREEN_H - 60; // minus GamesScreen header
  const { onLayout, scale } = useGameContainer({ naturalWidth: NATURAL_W, naturalHeight: NATURAL_H, paddingX: 12 });
  const BOARD_SIZE = NATURAL_BOARD;
  const chessboardRef = useRef<ChessboardRef>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const checkAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation for "Your Turn"
  useEffect(() => {
    if (isMyTurn && status === "active") {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
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
          Animated.timing(checkAnim, { toValue: 1, duration: 400, useNativeDriver: false }),
          Animated.timing(checkAnim, { toValue: 0, duration: 400, useNativeDriver: false }),
        ]),
        { iterations: 3 },
      ).start();
    }
  }, [inCheck]);

  // Sync board on rejoin
  useEffect(() => {
    if (status === "active" || status === "finished") {
      const timer = setTimeout(() => {
        chessboardRef.current?.reset?.(chess.fen());
        (chessboardRef.current as any)?.resetBoard?.(chess.fen());
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [status]);

  // Sync board when countdown finishes
  useEffect(() => {
    if (externalPhase !== "playing") return;
    setTimeout(() => {
      chessboardRef.current?.reset?.(chess.fen());
      (chessboardRef.current as any)?.resetBoard?.(chess.fen());
    }, 150);
  }, [externalPhase]);

  const myColorName = playerColor === "w" ? "White" : "Black";
  const oppColor = playerColor === "w" ? "b" : "w";
  const myCaps = playerColor === "w" ? captures.w : captures.b;
  const oppCaps = playerColor === "w" ? captures.b : captures.w;
  const wScore = getScore(captures.w);
  const bScore = getScore(captures.b);
  const myScore = playerColor === "w" ? wScore : bScore;
  const oppScore = playerColor === "w" ? bScore : wScore;
  const myAdvantage = myScore > oppScore ? `+${myScore - oppScore}` : null;
  const oppAdvantage = oppScore > myScore ? `+${oppScore - myScore}` : null;

  const myAvatarUri = (() => {
    const me = (players || []).find((p: any) => p.id === userId);
    return me?.avatar || null;
  })();
  const oppAvatarUri = (() => {
    const opp = (players || []).find((p: any) => p.id !== userId);
    return opp?.avatar || null;
  })();

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

  const renderPlayerRow = ({
    label, avatarUri, colorKey, caps, advantage, time, isTurn,
  }: {
    label: string; avatarUri: string | null | undefined; colorKey: "w" | "b";
    caps: string[]; advantage: string | null; time: number; isTurn: boolean;
  }) => (
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

  if (status === "connecting") {
    return (
      <View style={styles.fullCenter}>
        <View style={styles.connectCard}>
          <Text style={styles.connectIcon}>♟️</Text>
          <Text style={styles.connectTitle}>Chess</Text>
          <Text style={styles.connectSub}>Connecting to match…</Text>
          <View style={styles.dotRow}>
            {[0, 1, 2].map((i) => <WaitDot key={i} delay={i * 200} />)}
          </View>
        </View>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container} onLayout={onLayout}>
      {/* Scale the entire game as one unit — board, player cards, everything shrinks together */}
      <View style={{ width: NATURAL_W, height: NATURAL_H, transform: [{ scale }], alignSelf: "center" }}>
      {renderPlayerRow({
        label: opponentName, avatarUri: oppAvatarUri, colorKey: oppColor,
        caps: oppCaps, advantage: oppAdvantage, time: timers[oppColor],
        isTurn: chess.turn() === oppColor && status === "active",
      })}

      <View style={[styles.boardWrap, { width: BOARD_SIZE + 8, height: BOARD_SIZE + 8 }, inCheck && styles.boardWrapCheck]}>
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

      {renderPlayerRow({
        label: "You", avatarUri: myAvatarUri, colorKey: playerColor,
        caps: myCaps, advantage: myAdvantage, time: timers[playerColor],
        isTurn: isMyTurn && status === "active",
      }      )}
      </View>

      {status === "waiting" && (
        <View style={styles.waitingOverlay}>
          <View style={styles.connectCard}>
            <Text style={styles.connectIcon}>⏳</Text>
            <Text style={styles.connectTitle}>Waiting for Opponent</Text>
            <Text style={styles.connectSub}>Finding your chess rival…</Text>
            <View style={styles.colorBadge}>
              <Text style={styles.colorBadgeText}>You play as {myColorName}</Text>
            </View>
          </View>
        </View>
      )}

      {status === "finished" && (
        <View style={styles.gameOverOverlay}>
          <View style={styles.gameOverCard}>
            <Text style={styles.gameOverIcon}>
              {chess.isCheckmate()
                ? chess.turn() !== playerColor ? "🏆" : "😢"
                : "🤝"}
            </Text>
            <Text style={styles.gameOverTitle}>
              {chess.isCheckmate()
                ? chess.turn() !== playerColor ? "Checkmate! You Win!" : "Checkmate! You Lose"
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
        Animated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ).start();
  }, []);
  return <Animated.View style={[styles.dot, { opacity: anim }]} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#05050F", paddingHorizontal: 12, paddingTop: 8, justifyContent: "center" },
  fullCenter: { flex: 1, backgroundColor: "#05050F", justifyContent: "center", alignItems: "center", padding: 24 },
  waitingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(5,5,15,0.92)", justifyContent: "center", alignItems: "center", zIndex: 40 },
  connectCard: { backgroundColor: "#0F172A", borderRadius: 24, padding: 32, alignItems: "center", borderWidth: 1.5, borderColor: "rgba(124,58,237,0.25)", minWidth: 260 },
  connectIcon: { fontSize: 52, marginBottom: 16 },
  connectTitle: { fontSize: 22, fontWeight: "900", color: "#F8FAFC", marginBottom: 8 },
  connectSub: { fontSize: 14, color: "#64748B", marginBottom: 20 },
  colorBadge: { backgroundColor: "rgba(124,58,237,0.15)", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(124,58,237,0.3)" },
  colorBadgeText: { color: "#A78BFA", fontWeight: "700", fontSize: 13 },
  dotRow: { flexDirection: "row", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#7C3AED" },
  playerRow: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(31, 41, 55, 0.5)", padding: 10, marginHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  playerRowActive: { borderColor: "rgba(124,58,237,0.6)", backgroundColor: "rgba(76,29,149,0.22)" },
  avatarContainer: { position: "relative", width: 40, height: 40, marginRight: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: "rgba(255,255,255,0.1)" },
  avatarFallback: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.1)" },
  avatarFallbackText: { fontSize: 16, fontWeight: "900" },
  colorChipMini: { position: "absolute", bottom: -4, right: -4, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#0F172A" },
  colorChipTextMini: { fontSize: 10, fontWeight: "900" },
  playerInfo: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  playerName: { fontSize: 15, fontWeight: "800", color: "#F8FAFC" },
  captureRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  captureIcons: { fontSize: 16, color: "#A78BFA" },
  captureAdvantage: { fontSize: 11, color: "#34D399", fontWeight: "800" },
  timerBadge: { backgroundColor: "#1E293B", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  timerActive: { backgroundColor: "rgba(124,58,237,0.15)", borderColor: "rgba(124,58,237,0.5)" },
  timerText: { color: "#94A3B8", fontSize: 14, fontWeight: "700", fontFamily: "monospace" },
  timerTextActive: { color: "#F8FAFC" },
  moveBadge: { backgroundColor: "rgba(124,58,237,0.15)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: "rgba(124,58,237,0.3)" },
  moveBadgeText: { color: "#A78BFA", fontSize: 10, fontWeight: "700", fontFamily: "monospace" },
  boardWrap: { borderRadius: 14, overflow: "hidden", borderWidth: 2, borderColor: "rgba(124,58,237,0.45)", alignSelf: "center", alignItems: "center", justifyContent: "center", backgroundColor: "#0F172A", marginVertical: 10, elevation: 14, shadowColor: "#7C3AED", shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 4 } },
  boardWrapCheck: { borderColor: "#EF4444", shadowColor: "#EF4444" },
  checkBanner: { position: "absolute", top: 8, zIndex: 20, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, backgroundColor: "rgba(239,68,68,0.9)", shadowColor: "#EF4444", shadowOpacity: 0.6, shadowRadius: 10 },
  checkText: { color: "#FFF", fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  gameOverOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(5,5,15,0.88)", justifyContent: "center", alignItems: "center", zIndex: 50 },
  gameOverCard: { backgroundColor: "#0F172A", borderRadius: 24, padding: 36, alignItems: "center", borderWidth: 2, borderColor: "rgba(124,58,237,0.4)", minWidth: 260 },
  gameOverIcon: { fontSize: 64, marginBottom: 16 },
  gameOverTitle: { fontSize: 22, fontWeight: "900", color: "#F8FAFC", textAlign: "center", marginBottom: 8 },
  gameOverSub: { fontSize: 13, color: "#64748B" },
});
