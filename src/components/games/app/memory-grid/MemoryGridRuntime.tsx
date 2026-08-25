/**
 * MemoryGridRuntime — game-specific state for memory grid.
 * Uses shared useGameSocket for all socket lifecycle.
 */

import React, { useEffect, useState, useRef, useCallback } from "react";
import { Animated } from "react-native";
import { useGameSocket, GAME_EVENTS } from "../../../../hooks/useGameSocket";
import { gameSound } from "../../../../services/gameSound";
import type { HtmlGameResult, PlayerContext } from "../../../../games/types";
import MemoryGridGame from "./MemoryGridGame";

interface MemoryGridRuntimeProps {
  matchId: string;
  userId: string;
  wsToken: string;
  players?: PlayerContext[];
  externalPhase?: "playing" | "waiting";
  onComplete: (result: HtmlGameResult) => void;
  /** Resolved game assets from the asset manifest system (key → local URI). */
  assets?: Record<string, string>;
}

export default function MemoryGridRuntime({
  matchId, userId, wsToken, players, externalPhase = "waiting", onComplete,
}: MemoryGridRuntimeProps) {
  const [roundPhase, setRoundPhase] = useState<"SHOW" | "INPUT">("SHOW");
  const [currentRound, setCurrentRound] = useState(0);
  const [score, setScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [pattern, setPattern] = useState<number[]>([]);
  const [activeCell, setActiveCell] = useState<number | null>(null);
  const [playerInputs, setPlayerInputs] = useState<number[]>([]);
  const [totalRounds, setTotalRounds] = useState(1);

  const totalRoundsRef = useRef(1);
  const inputsRef = useRef<number[]>([]);
  const submittedRef = useRef(false);
  const lastRoundRef = useRef(-1);
  const prevPhaseRef = useRef("SHOW");
  const patternKeyRef = useRef("");
  const wrongAnim = useRef(new Animated.Value(0)).current;

  const syncState = useCallback((ps: any) => {
    if (ps.roundPhase) {
      setRoundPhase(ps.roundPhase);
      if (ps.roundPhase === "INPUT" && prevPhaseRef.current === "SHOW") {
        submittedRef.current = false;
      }
      if (ps.roundPhase !== prevPhaseRef.current) prevPhaseRef.current = ps.roundPhase;
    }
    if (ps.currentRound !== undefined) {
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
      const oppId = Object.keys(ps.scores).find(id => id !== userId && !id.startsWith("bot_"));
      if (oppId) setOpponentScore(ps.scores[oppId]);
      const botId = Object.keys(ps.scores).find(id => id.startsWith("bot_"));
      if (botId && !oppId) setOpponentScore(ps.scores[botId]);
    }
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
  }, [userId]);

  const triggerWrongShake = useCallback(() => {
    gameSound.playError();
    wrongAnim.setValue(0);
    Animated.sequence([
      Animated.timing(wrongAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(wrongAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(wrongAnim, { toValue: 7, duration: 50, useNativeDriver: true }),
      Animated.timing(wrongAnim, { toValue: -7, duration: 50, useNativeDriver: true }),
      Animated.timing(wrongAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [wrongAnim]);

  const { socket, status, sendCommand } = useGameSocket({
    matchId, userId, wsToken, externalPhase, onComplete,
    onConnectAck: (data) => {
      if (data.state?.pluginState) syncState(data.state.pluginState);
      return {};
    },
    onStart: (data) => {
      if (data.state?.pluginState) syncState(data.state.pluginState);
    },
    onSync: (pluginState) => {
      syncState(pluginState);
    },
  });

  // ERROR listener for wrong answers
  useEffect(() => {
    if (!socket) return;
    const handleError = (e: any) => {
      submittedRef.current = false;
      inputsRef.current = [];
      setPlayerInputs([]);
      const msg = String(e?.message || "").toLowerCase();
      const looksWrong = msg.includes("wrong") || msg.includes("incorrect") ||
        msg.includes("does not match") || msg.includes("invalid sequence") || msg.includes("mismatch");
      if (looksWrong || prevPhaseRef.current === "INPUT") triggerWrongShake();
    };
    socket.on("ERROR", handleError);
    return () => socket.off("ERROR", handleError);
  }, [socket, triggerWrongShake]);

  // SHOW phase animation
  useEffect(() => {
    if (status !== "active" || externalPhase !== "playing" || roundPhase !== "SHOW" || pattern.length === 0) return;
    let isCancelled = false;
    let step = 0;
    const animate = async () => {
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
      if (!isCancelled && socket && !submittedRef.current) {
        submittedRef.current = true;
        socket.emit("MOVE", { type: "READY_INPUT" });
        inputsRef.current = [];
        setPlayerInputs([]);
      }
    };
    animate();
    return () => { isCancelled = true; };
  }, [status, externalPhase, roundPhase, pattern, socket]);

  const handleCellTap = useCallback((index: number) => {
    if (status !== "active" || roundPhase !== "INPUT" || submittedRef.current) return;
    setActiveCell(index);
    setTimeout(() => setActiveCell(null), 150);
    const newInputs = [...inputsRef.current, index];
    inputsRef.current = newInputs;
    setPlayerInputs(newInputs);
    if (newInputs.length === pattern.length) {
      submittedRef.current = true;
      sendCommand(GAME_EVENTS.MOVE, { type: "INPUT", tiles: newInputs });
      gameSound.playCorrect();
    } else {
      gameSound.playTap();
    }
  }, [status, roundPhase, pattern.length, sendCommand]);

  return (
    <MemoryGridGame
      matchId={matchId} userId={userId} players={players}
      externalPhase={externalPhase} onComplete={onComplete}      status={status as any}
      roundPhase={roundPhase} currentRound={currentRound} score={score}
      opponentScore={opponentScore} pattern={pattern} activeCell={activeCell}
      playerInputs={playerInputs} totalRounds={totalRounds} wrongAnim={wrongAnim}
      handleCellTap={handleCellTap} isMyTurn={status === "active"}
    />
  );
}
