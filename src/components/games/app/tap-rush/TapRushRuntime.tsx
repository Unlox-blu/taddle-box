/**
 * TapRushRuntime — game-specific state for tap rush.
 * Uses shared useGameSocket for all socket lifecycle.
 */

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useGameSocket, GAME_EVENTS } from "../../../../hooks/useGameSocket";
import type { HtmlGameResult, PlayerContext } from "../../../../games/types";
import TapRushGame from "./TapRushGame";

const TARGET_TTL_MS = 3000;

interface Target {
  seq: number;
  x: number;
  y: number;
  delay: number;
}

interface TapRushRuntimeProps {
  matchId: string;
  userId: string;
  wsToken: string;
  players?: PlayerContext[];
  externalPhase?: "playing" | "waiting";
  onComplete: (result: HtmlGameResult) => void;
  /** Resolved game assets from the asset manifest system (key → local URI). */
  assets?: Record<string, string>;
}

function readDurationMs(state: any): number {
  const md = state?.metadata || {};
  const nested = md.matchMetadata || {};
  return nested.durationMs || md.durationMs || 20000;
}

export default function TapRushRuntime({
  matchId, userId, wsToken, players, externalPhase = "waiting", onComplete,
}: TapRushRuntimeProps) {
  const [durationSec, setDurationSec] = useState(20);
  const [timeLeft, setTimeLeft] = useState(20);
  const [score, setScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [activeTarget, setActiveTarget] = useState<Target | null>(null);
  const [targetSequence, setTargetSequence] = useState<Target[]>([]);

  const lastTapSeqRef = useRef(-1);
  const roundStartRef = useRef<number | null>(null);

  const applyScores = useCallback((scores: Record<string, number>) => {
    setScore(scores[userId] || 0);
    const oppId = Object.keys(scores).find(id => id !== userId && !id.startsWith("bot_"));
    if (oppId) setOpponentScore(scores[oppId]);
    const botId = Object.keys(scores).find(id => id.startsWith("bot_"));
    if (botId && !oppId) setOpponentScore(scores[botId]);
  }, [userId]);

  const { socket, status, sendCommand } = useGameSocket({
    matchId, userId, wsToken, externalPhase, onComplete,
    onConnectAck: (data) => {
      const ps = data.state?.pluginState;
      if (ps?.targetSequence) setTargetSequence(ps.targetSequence);
      if (ps?.scores) applyScores(ps.scores);
      setDurationSec(Math.round(readDurationMs(data.state) / 1000));
      if (data.state?.status === "ACTIVE") roundStartRef.current = Date.now();
      return {};
    },
    onStart: (data) => {
      roundStartRef.current = Date.now();
      if (data.state?.pluginState?.targetSequence) {
        setTargetSequence(data.state.pluginState.targetSequence);
      }
      setDurationSec(Math.round(readDurationMs(data.state) / 1000));
    },
    onSync: (pluginState) => {
      if (pluginState?.scores) applyScores(pluginState.scores);
    },
  });

  // Round clock
  useEffect(() => {
    if (status !== "active" || externalPhase !== "playing") return;
    const started = roundStartRef.current;
    let remaining = durationSec;
    if (started) {
      remaining = Math.max(0, durationSec - Math.floor((Date.now() - started) / 1000));
    }
    setTimeLeft(remaining);
    const interval = setInterval(() => setTimeLeft((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(interval);
  }, [status, externalPhase, durationSec]);

  // Target reveal schedule
  useEffect(() => {
    if (status !== "active" || externalPhase !== "playing" || targetSequence.length === 0) return;
    const started = roundStartRef.current;
    const elapsed = started ? Math.max(0, Date.now() - started) : 0;
    const timers: NodeJS.Timeout[] = [];
    targetSequence.forEach((t) => {
      const delay = Math.max(0, t.delay - elapsed);
      timers.push(setTimeout(() => setActiveTarget(t), delay));
      timers.push(setTimeout(() => {
        setActiveTarget((prev) => (prev?.seq === t.seq ? null : prev));
      }, delay + TARGET_TTL_MS));
    });
    const lastDelay = targetSequence[targetSequence.length - 1]?.delay || 0;
    timers.push(setTimeout(() => setActiveTarget(null), Math.max(0, lastDelay - elapsed) + TARGET_TTL_MS + 200));
    return () => timers.forEach(clearTimeout);
  }, [status, externalPhase, targetSequence]);

  const handleTap = useCallback(() => {
    if (!activeTarget || status !== "active") return;
    const seq = activeTarget.seq;
    if (seq === lastTapSeqRef.current) return;
    lastTapSeqRef.current = seq;
    setScore((s) => s + 1);
    setActiveTarget(null);
    sendCommand(GAME_EVENTS.MOVE, { type: "TAP", seq, clientTs: Date.now() });
  }, [activeTarget, status, sendCommand]);

  return (
    <TapRushGame
      matchId={matchId} userId={userId} players={players}
      externalPhase={externalPhase} onComplete={onComplete}      status={status as any}
      durationSec={durationSec} timeLeft={timeLeft} score={score}
      opponentScore={opponentScore} activeTarget={activeTarget}
      targetSequence={targetSequence} handleTap={handleTap} isMyTurn={true}
    />
  );
}
