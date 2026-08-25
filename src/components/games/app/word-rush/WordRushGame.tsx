/**
 * WordRushGame — pure renderer.
 *
 * Receives all game state + callbacks from WordRushRuntime via props.
 * No socket. No game logic. Pure pixels.
 */

import React, { useEffect, useRef, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, ScrollView, Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { HtmlGameResult, PlayerContext } from "../../../../games/types";

const { width } = Dimensions.get("window");
const BOARD_PADDING = 20;
const GRID_COLS = 4;
const TILE_GAP = 8;
const TILE_SIZE = Math.floor((width - BOARD_PADDING * 2 - TILE_GAP * (GRID_COLS - 1)) / GRID_COLS);

type FoundWord = { word: string; path: number[]; score: number; userId?: string };

type Props = {
  matchId: string;
  userId: string;
  externalPhase?: "playing" | "waiting";
  onComplete: (result: HtmlGameResult) => void;
  // Game state (from WordRushRuntime)
  status: "connecting" | "waiting" | "active" | "finished";
  grid: string[];
  selectedIndices: number[];
  foundWords: FoundWord[];
  scores: Record<string, number>;
  timeLeft: number;
  round: number;
  totalRounds: number;
  lastResult: "valid" | "invalid" | "duplicate" | null;
  lastError: string;
  lastValidWord: string;
  submitting: boolean;
  resultAnim: Animated.Value;
  shakeAnim: Animated.Value;
  timerBarAnim: Animated.Value;
  // Actions
  submitWord: () => void;
  selectCell: (index: number) => void;
  clearSelection: () => void;
  isMyTurn: boolean;
};

export default function WordRushGame({
  matchId,
  userId,
  externalPhase = "waiting",
  onComplete,
  status,
  grid,
  selectedIndices,
  foundWords,
  scores,
  timeLeft,
  round,
  totalRounds,
  lastResult,
  lastError,
  lastValidWord,
  submitting,
  resultAnim,
  shakeAnim,
  timerBarAnim,
  submitWord,
  selectCell,
  clearSelection,
  isMyTurn,
}: Props) {
  const onTilePress = useCallback((idx: number) => {
    if (status !== "active") return;
    selectCell(idx);
  }, [status, selectCell]);

  const selectedWord = selectedIndices.map((i) => grid[i] || "").join("").toUpperCase();
  const myScore = scores[userId] || 0;
  const oppId =
    Object.keys(scores).find((id) => id !== userId && !id.startsWith("bot_")) ||
    Object.keys(scores).find((id) => id.startsWith("bot_"));
  const opponentScore = oppId ? scores[oppId] || 0 : 0;
  const myFoundWords = foundWords.filter((w: any) => w.userId === userId);
  const isValid = selectedIndices.length >= 3;

  // Determine adjacent tiles for highlight
  const adjacentToLast = new Set<number>();
  if (selectedIndices.length > 0) {
    const last = selectedIndices[selectedIndices.length - 1];
    const r = Math.floor(last / 4), c = last % 4;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < 4 && nc >= 0 && nc < 4) {
          const ni = nr * 4 + nc;
          if (!selectedIndices.includes(ni)) adjacentToLast.add(ni);
        }
      }
    }
  }

  if (status === "connecting") {
    return (
      <View style={styles.fullCenter}>
        <View style={styles.connectingPulse}>
          <Text style={styles.connectingIcon}>🔤</Text>
        </View>
        <Text style={styles.connectingTitle}>Word Rush</Text>
        <Text style={styles.connectingSubtitle}>Connecting to match…</Text>
      </View>
    );
  }

  if (status === "waiting") {
    return (
      <View style={styles.fullCenter}>
        <View style={styles.waitingCard}>
          <Text style={styles.waitingIcon}>⏳</Text>
          <Text style={styles.waitingTitle}>Waiting for opponent</Text>
          <Text style={styles.waitingSubtitle}>Get ready to rush those words!</Text>
          <View style={styles.dotRow}>
            {[0, 1, 2].map((i) => <WaitDot key={i} delay={i * 200} />)}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.roundLabel}>ROUND {round} / {totalRounds}</Text>
          <Text style={styles.title}>Word Rush</Text>
        </View>
        <View style={styles.timerWrap}>
          <Text style={[styles.timerText, timeLeft <= 15 && styles.timerUrgent]}>{timeLeft}s</Text>
          <View style={styles.timerTrack}>
            <Animated.View style={[
              styles.timerBar,
              { width: timerBarAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) },
              timeLeft <= 15 && styles.timerBarUrgent,
            ]} />
          </View>
        </View>
      </View>

      <View style={styles.scoreStrip}>
        <View style={styles.scoreItem}>
          <Text style={styles.scoreNum}>{myScore}</Text>
          <Text style={styles.scoreLabel}>My Score</Text>
        </View>
        <View style={styles.scoreDiv} />
        <View style={styles.scoreItem}>
          <Text style={styles.scoreNum}>{opponentScore}</Text>
          <Text style={styles.scoreLabel}>Opponent</Text>
        </View>
        <View style={styles.scoreDiv} />
        <View style={styles.scoreItem}>
          <Text style={styles.scoreNum}>{myFoundWords.length}</Text>
          <Text style={styles.scoreLabel}>Words Found</Text>
        </View>
        <View style={styles.scoreDiv} />
        <View style={styles.scoreItem}>
          <Text style={styles.scoreNum}>{selectedIndices.length}</Text>
          <Text style={styles.scoreLabel}>Selected</Text>
        </View>
      </View>

      <Animated.View style={[
        styles.wordPreview,
        lastResult === "valid" && styles.wordPreviewValid,
        lastResult === "invalid" && styles.wordPreviewInvalid,
        lastResult === "duplicate" && styles.wordPreviewDuplicate,
        { transform: [{ translateX: shakeAnim }] },
      ]}>
        {lastResult === "valid" ? (
          <Text style={styles.wordPreviewValidText}>✅ {lastValidWord || selectedWord || "..."}</Text>
        ) : lastResult === "invalid" || lastResult === "duplicate" ? (
          <Text style={styles.wordPreviewInvalidText}>❌ {lastError}</Text>
        ) : selectedIndices.length > 0 ? (
          <Text style={styles.wordPreviewText}>{selectedWord}</Text>
        ) : (
          <Text style={styles.wordPreviewHint}>Tap adjacent letters to form words</Text>
        )}
      </Animated.View>

      <View style={styles.gridContainer}>
        <View style={styles.grid}>
          {(grid.length === 16 ? grid : Array(16).fill("?")).map((letter, idx) => {
            const isSelected = selectedIndices.includes(idx);
            const selOrder = selectedIndices.indexOf(idx);
            const isAdjacent = adjacentToLast.has(idx) && selectedIndices.length > 0;
            const isLast = selectedIndices.length > 0 && selectedIndices[selectedIndices.length - 1] === idx;
            return (
              <TouchableOpacity
                key={idx}
                onPress={() => onTilePress(idx)}
                activeOpacity={0.7}
                style={[
                  styles.tile,
                  isSelected && styles.tileSelected,
                  isLast && styles.tileLast,
                  isAdjacent && !isSelected && styles.tileAdjacent,
                ]}
              >
                {isSelected && (
                  <LinearGradient
                    colors={isLast ? ["#A855F7", "#7C3AED"] : ["#7C3AED", "#0891B2"]}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  />
                )}
                <Text style={[styles.tileText, isSelected && styles.tileTextSelected]}>{letter}</Text>
                {isSelected && (
                  <View style={styles.tileOrderBadge}>
                    <Text style={styles.tileOrderText}>{selOrder + 1}</Text>
                  </View>
                )}
                {isAdjacent && !isSelected && <View style={styles.adjacentDot} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.clearBtn} onPress={clearSelection} disabled={selectedIndices.length === 0}>
          <Text style={[styles.clearBtnText, selectedIndices.length === 0 && { opacity: 0.35 }]}>✕ Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitBtn, (!isValid || submitting) && styles.submitBtnDisabled]}
          onPress={submitWord}
          disabled={!isValid || submitting}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={isValid && !submitting ? ["#7C3AED", "#0891B2"] : ["#1E293B", "#1E293B"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.submitGradient}
          >
            <Text style={[styles.submitText, (!isValid || submitting) && { color: "#475569" }]}>
              {submitting ? "Checking…" : isValid ? `Submit "${selectedWord}"` : "Select 3+ letters"}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {myFoundWords.length > 0 && (
        <View style={styles.foundSection}>
          <Text style={styles.foundTitle}>YOUR WORDS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.foundScroll}>
            {myFoundWords.slice().reverse().map((fw, i) => (
              <View key={i} style={styles.foundChip}>
                <Text style={styles.foundWord}>{fw.word}</Text>
                <Text style={styles.foundScore}>+{fw.score}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
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
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[styles.dot, { opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]} />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#05050F", paddingHorizontal: BOARD_PADDING, paddingTop: 12 },
  fullCenter: { flex: 1, backgroundColor: "#05050F", justifyContent: "center", alignItems: "center", padding: 24 },
  connectingPulse: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(124,58,237,0.15)", justifyContent: "center", alignItems: "center", marginBottom: 20, borderWidth: 2, borderColor: "rgba(124,58,237,0.3)" },
  connectingIcon: { fontSize: 36 },
  connectingTitle: { fontSize: 26, fontWeight: "900", color: "#F8FAFC", marginBottom: 8 },
  connectingSubtitle: { fontSize: 14, color: "#64748B" },
  waitingCard: { backgroundColor: "#0F172A", borderRadius: 24, padding: 32, alignItems: "center", borderWidth: 1.5, borderColor: "rgba(124,58,237,0.25)" },
  waitingIcon: { fontSize: 48, marginBottom: 16 },
  waitingTitle: { fontSize: 20, fontWeight: "900", color: "#F8FAFC", marginBottom: 8 },
  waitingSubtitle: { fontSize: 14, color: "#64748B", marginBottom: 20 },
  dotRow: { flexDirection: "row", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#7C3AED" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  roundLabel: { fontSize: 10, color: "#7C3AED", fontWeight: "800", letterSpacing: 1.5, marginBottom: 2 },
  title: { fontSize: 22, fontWeight: "900", color: "#F8FAFC" },
  timerWrap: { alignItems: "flex-end" },
  timerText: { fontSize: 26, fontWeight: "900", color: "#A78BFA", lineHeight: 30 },
  timerUrgent: { color: "#EF4444" },
  timerTrack: { width: 64, height: 4, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 2, marginTop: 4, overflow: "hidden" },
  timerBar: { height: "100%", backgroundColor: "#7C3AED", borderRadius: 2 },
  timerBarUrgent: { backgroundColor: "#EF4444" },
  scoreStrip: { flexDirection: "row", backgroundColor: "#0F172A", borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "rgba(124,58,237,0.15)" },
  scoreItem: { flex: 1, alignItems: "center" },
  scoreNum: { fontSize: 22, fontWeight: "900", color: "#A78BFA" },
  scoreLabel: { fontSize: 10, color: "#475569", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 },
  scoreDiv: { width: 1, backgroundColor: "rgba(255,255,255,0.07)" },
  wordPreview: { backgroundColor: "#0F172A", borderRadius: 14, padding: 14, marginBottom: 12, alignItems: "center", justifyContent: "center", minHeight: 52, borderWidth: 1.5, borderColor: "rgba(124,58,237,0.2)" },
  wordPreviewValid: { borderColor: "#22C55E", backgroundColor: "rgba(34,197,94,0.08)" },
  wordPreviewInvalid: { borderColor: "#EF4444", backgroundColor: "rgba(239,68,68,0.08)" },
  wordPreviewDuplicate: { borderColor: "#F59E0B", backgroundColor: "rgba(245,158,11,0.08)" },
  wordPreviewText: { fontSize: 28, fontWeight: "900", color: "#F8FAFC", letterSpacing: 5 },
  wordPreviewValidText: { fontSize: 20, fontWeight: "900", color: "#22C55E", letterSpacing: 3 },
  wordPreviewInvalidText: { fontSize: 18, fontWeight: "800", color: "#EF4444" },
  wordPreviewHint: { fontSize: 13, color: "#475569", fontStyle: "italic" },
  gridContainer: { alignItems: "center", marginBottom: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: TILE_GAP, width: TILE_SIZE * GRID_COLS + TILE_GAP * (GRID_COLS - 1) },
  tile: { width: TILE_SIZE, height: TILE_SIZE, backgroundColor: "#1E293B", borderRadius: 14, justifyContent: "center", alignItems: "center", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.06)", overflow: "hidden", position: "relative" },
  tileSelected: { borderColor: "transparent", elevation: 10, shadowColor: "#7C3AED", shadowOpacity: 0.7, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  tileLast: { borderColor: "#A855F7", borderWidth: 2.5 },
  tileAdjacent: { borderColor: "rgba(124,58,237,0.4)", backgroundColor: "rgba(124,58,237,0.06)" },
  tileText: { fontSize: 24, fontWeight: "900", color: "#94A3B8" },
  tileTextSelected: { color: "#FFFFFF" },
  tileOrderBadge: { position: "absolute", top: 4, right: 5, backgroundColor: "rgba(0,0,0,0.35)", borderRadius: 6, paddingHorizontal: 3, paddingVertical: 1 },
  tileOrderText: { fontSize: 8, color: "#FFF", fontWeight: "900" },
  adjacentDot: { position: "absolute", bottom: 6, width: 5, height: 5, borderRadius: 2.5, backgroundColor: "rgba(124,58,237,0.6)" },
  actions: { flexDirection: "row", gap: 10, marginBottom: 14 },
  clearBtn: { backgroundColor: "rgba(239,68,68,0.12)", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, justifyContent: "center", borderWidth: 1.5, borderColor: "rgba(239,68,68,0.25)" },
  clearBtnText: { color: "#EF4444", fontWeight: "800", fontSize: 14 },
  submitBtn: { flex: 1, borderRadius: 14, overflow: "hidden" },
  submitBtnDisabled: { opacity: 0.6 },
  submitGradient: { paddingVertical: 14, justifyContent: "center", alignItems: "center" },
  submitText: { color: "#FFF", fontWeight: "900", fontSize: 14, letterSpacing: 0.3 },
  foundSection: { },
  foundTitle: { fontSize: 10, color: "#475569", fontWeight: "800", letterSpacing: 1.5, marginBottom: 8 },
  foundScroll: { gap: 6, paddingBottom: 16 },
  foundChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(124,58,237,0.12)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(124,58,237,0.25)" },
  foundWord: { color: "#A78BFA", fontWeight: "800", fontSize: 13 },
  foundScore: { color: "#7C3AED", fontWeight: "900", fontSize: 12 },
});
