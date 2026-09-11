/**
 * WordRushRuntime — game-specific state for word rush.
 * Uses shared useGameSocket for all socket lifecycle.
 */

import React, { useEffect, useState, useRef, useCallback } from "react";
import { Animated } from "react-native";
import { useGameSocket, GAME_EVENTS } from "../../hooks/useGameSocket";
import { gameSound } from "../../media/game-sound";
import type { HtmlGameResult, PlayerContext } from "../game-runtime.types";
import { themedAlert } from "../../../../design-system/components/ThemedAlert";
import WordRushGame from "./WordRushGame";

type FoundWord = { word: string; path: number[]; score: number };

interface WordRushRuntimeProps {
  matchId: string;
  userId: string;
  wsToken: string;
  externalPhase?: "playing" | "waiting";
  onComplete: (result: HtmlGameResult) => void;
  /** Resolved game assets from the asset manifest system (key → local URI). */
  assets?: Record<string, string>;
}

export default function WordRushRuntime({
  matchId,
  userId,
  wsToken,
  externalPhase = "waiting",
  onComplete,
}: WordRushRuntimeProps) {
  const [grid, setGrid] = useState<string[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [foundWords, setFoundWords] = useState<FoundWord[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [round, setRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(1);
  const [lastResult, setLastResult] = useState<"valid" | "invalid" | "duplicate" | null>(null);
  const [lastError, setLastError] = useState<string>("");
  const [lastValidWord, setLastValidWord] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [roundIntroVisible, setRoundIntroVisible] = useState(false);

  const resultAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<any>(null);
  const timerBarAnim = useRef(new Animated.Value(1)).current;
  const roundRef = useRef(0);
  const roundDeadlineRef = useRef<number | null>(null);
  const roundIntroTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startLocalTimer = useCallback((roundStartedAt: number, roundEndsAt: number) => {
    clearInterval(timerRef.current);
    const roundDurationMs = roundEndsAt - roundStartedAt;

    const updateTimer = () => {
      const remainingMs = Math.max(0, roundEndsAt - Date.now());
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      setTimeLeft(remainingSeconds);
      timerBarAnim.setValue(Math.min(1, remainingMs / roundDurationMs));
      if (remainingMs === 0) clearInterval(timerRef.current);
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 250);
  }, [timerBarAnim]);

  const applyState = useCallback((ps: any) => {
    if (ps.grid && Array.isArray(ps.grid)) setGrid(ps.grid);
    if (ps.scores) setScores(ps.scores);
    if (ps.foundWords && Array.isArray(ps.foundWords)) setFoundWords(ps.foundWords);
    if (ps.currentRound) {
      if (ps.currentRound !== roundRef.current) {
        roundRef.current = ps.currentRound;
        setRound(ps.currentRound);
        setSelectedIndices([]);
        setLastResult(null);
        setLastError("");
        setLastValidWord("");
        setSubmitting(false);
      }
    }
    if (ps.totalRounds) setTotalRounds(ps.totalRounds);
    if (
      typeof ps.roundStartedAt === "number" &&
      typeof ps.roundEndsAt === "number" &&
      ps.roundEndsAt !== roundDeadlineRef.current
    ) {
      roundDeadlineRef.current = ps.roundEndsAt;
      startLocalTimer(ps.roundStartedAt, ps.roundEndsAt);
      setRoundIntroVisible(true);
      if (roundIntroTimeoutRef.current) clearTimeout(roundIntroTimeoutRef.current);
      roundIntroTimeoutRef.current = setTimeout(() => setRoundIntroVisible(false), 1500);
    }
  }, [startLocalTimer]);

  const triggerSuccess = useCallback(() => {
    setLastResult("valid");
    resultAnim.setValue(0);
    Animated.sequence([
      Animated.timing(resultAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1500),
      Animated.timing(resultAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setLastResult(null);
      setLastError("");
      setLastValidWord("");
    });
  }, [resultAnim]);

  const triggerShake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const { socket, status, sendCommand } = useGameSocket({
    matchId, userId, wsToken, externalPhase, onComplete,
    onConnectAck: (data) => {
      const ps = data.state?.pluginState;
      if (ps) applyState(ps);
      return {};
    },
    onStart: (data) => {
      const ps = data.state?.pluginState ?? data.state;
      if (ps) applyState(ps);
    },
    onSync: (pluginState, _revision, event) => {
      applyState(pluginState);
      setSubmitting(false);
      if (event?.valid === true && String(event.userId) === String(userId)) {
        setSelectedIndices([]);
      }
    },
  });

  // Handle SYNC-level result signals (VALID word detected)
  // The onSync callback handles state, but result animations need the raw SYNC data
  const handleSyncResult = useCallback((data: any) => {
    if (
      (data?.result === "VALID" || data?.valid === true) &&
      (!data?.userId || data.userId === userId)
    ) {
      setSelectedIndices([]);
      setSubmitting(false);
      triggerSuccess();
    }
  }, [userId, triggerSuccess]);

  // Handle ERROR for duplicate/invalid words
  const handleError = useCallback((e: any) => {
    setSubmitting(false);
    const msg = (e.message || "").toLowerCase();
    if (msg.includes("already used") || msg.includes("duplicate")) {
      setLastError("Already used!");
      setLastResult("duplicate");
      triggerShake();
    } else if (
      msg.includes("not a valid") || msg.includes("not found") ||
      msg.includes("dictionary") || msg.includes("too short") ||
      msg.includes("does not spell") || msg.includes("adjacent") ||
      msg.includes("invalid path") || msg.includes("invalid move")
    ) {
      setLastError("Not a word!");
      setLastResult("invalid");
      triggerShake();
    } else {
      themedAlert("Error", e.message || "Something went wrong");
    }
  }, [triggerShake]);

  // Re-attach SYNC result + ERROR listeners on the raw socket
  useEffect(() => {
    if (!socket) return;
    socket.on("SYNC", handleSyncResult);
    socket.on("ERROR", handleError);
    return () => {
      socket.off("SYNC", handleSyncResult);
      socket.off("ERROR", handleError);
    };
  }, [socket, handleSyncResult, handleError]);

  const submitWord = useCallback(() => {
    if (submitting || selectedIndices.length === 0) return;
    const word = selectedIndices.map((i) => grid[i]).join("");
    if (word.length < 3) return;
    setSubmitting(true);
    setLastValidWord(word);
    sendCommand(GAME_EVENTS.MOVE, { type: "SUBMIT_WORD", path: selectedIndices, word });
  }, [submitting, selectedIndices, sendCommand, grid]);

  const selectCell = useCallback((index: number) => {
    setSelectedIndices((prev) => {
      if (prev.length === 0) return [index];

      const lastIndex = prev[prev.length - 1];
      if (index === lastIndex) return prev.slice(0, -1);
      if (prev.includes(index)) return prev;

      const rowDistance = Math.abs(Math.floor(index / 4) - Math.floor(lastIndex / 4));
      const columnDistance = Math.abs((index % 4) - (lastIndex % 4));
      if (rowDistance > 1 || columnDistance > 1) return prev;

      return [...prev, index];
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIndices([]), []);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    if (roundIntroTimeoutRef.current) clearTimeout(roundIntroTimeoutRef.current);
  }, []);

  return (
    <WordRushGame
      matchId={matchId} userId={userId} externalPhase={externalPhase}
      onComplete={onComplete}      status={status as any}
      grid={grid} selectedIndices={selectedIndices} foundWords={foundWords}
      scores={scores} timeLeft={timeLeft} round={round} totalRounds={totalRounds}
      roundIntroVisible={roundIntroVisible}
      lastResult={lastResult} lastError={lastError} lastValidWord={lastValidWord}
      submitting={submitting} resultAnim={resultAnim} shakeAnim={shakeAnim}
      timerBarAnim={timerBarAnim} submitWord={submitWord} selectCell={selectCell}
      clearSelection={clearSelection} isMyTurn={status === "active"}
    />
  );
}
