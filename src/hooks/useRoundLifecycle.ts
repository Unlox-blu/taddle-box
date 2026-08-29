/**
 * useRoundLifecycle — orchestration-only hook for multi-round matches.
 *
 * Responsibilities:
 *   - Receives round socket events via DeviceEventEmitter (same as other game events)
 *   - Validates round transitions (deduplicates by eventId)
 *   - Maintains current RoundContext
 *   - Coordinates asset preload for each round
 *   - Emits ROUND_READY to server when assets are loaded
 *   - Exposes round/match results for UI
 *
 * Reconnect handling (P0):
 *   - On CONNECT_ACK, clears processedEvents so the same events can be
 *     re-processed if they arrive again after reconnect
 *   - If the round is LOADING/WAITING on reconnect, re-sends ROUND_READY
 *   - If the server skipped ahead to a later round, adopts the server's
 *     authoritative round context immediately
 *   - Never sends ROUND_READY for a round that is already ACTIVE or FINISHED
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { DeviceEventEmitter } from "react-native";
import type { RoundContext } from "../types";
import { warn } from "../utils/logger";

interface RoundResult {
  winner: string | null;
  standings: Array<{
    userId: string;
    roundScore: number;
    matchScore: number;
    position: number;
  }>;
}

interface MatchResult {
  winner: string | null;
  roundResult: RoundResult;
  rewardRankings?: Array<{
    userId: string;
    result: string;
    rank: number;
    xpEarned: number;
    isBot?: boolean;
  }>;
}

interface UseRoundLifecycleOptions {
  matchId: string;
  configuredRounds: number;
  /** Emit to the game engine socket (passed from the runtime via ref) */
  emitToServer?: (event: string, data: any) => void;
}

export function useRoundLifecycle({
  matchId,
  configuredRounds,
  emitToServer,
}: UseRoundLifecycleOptions) {
  const [round, setRound] = useState<RoundContext | null>(null);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [assetsReady, setAssetsReady] = useState(false);

  // Track processed eventIds to deduplicate
  const processedEvents = useRef(new Set<string>());
  // Track current roundId for stale event rejection
  const currentRoundId = useRef<string | null>(null);
  // Store emit function in ref so listeners always have the latest
  const emitRef = useRef(emitToServer);
  useEffect(() => { emitRef.current = emitToServer; }, [emitToServer]);
  // Track whether we've sent ROUND_READY for the current round
  const roundReadySent = useRef<string | null>(null);

  // Reset on match change
  useEffect(() => {
    setRound(null);
    setRoundResult(null);
    setMatchResult(null);
    setAssetsReady(false);
    processedEvents.current.clear();
    currentRoundId.current = null;
    roundReadySent.current = null;
  }, [matchId]);

  /**
   * Preload assets and send ROUND_READY if the round needs it.
   * Safe to call multiple times — deduplicates by roundId.
   */
  const preloadAndReady = useCallback(
    async (roundCtx: RoundContext) => {
      // Don't send ROUND_READY for rounds that are already ACTIVE or FINISHED
      if (roundCtx.status === "ACTIVE" || roundCtx.status === "FINISHED") {
        setAssetsReady(true);
        return;
      }

      setAssetsReady(true);

      // Send ROUND_READY only once per roundId
      if (roundReadySent.current !== roundCtx.roundId) {
        roundReadySent.current = roundCtx.roundId;
        emitRef.current?.("ROUND_READY", {
          matchId,
          roundId: roundCtx.roundId,
        });
      }
    },
    [matchId]
  );

  // Handle ROUND_CREATED — server created next round definition
  const handleRoundCreated = useCallback(
    async (data: any) => {
      if (data.matchId !== matchId) return;
      if (data.eventId && processedEvents.current.has(data.eventId)) return;
      if (data.eventId) processedEvents.current.add(data.eventId);

      const roundCtx = data.round as RoundContext;

      // Guard: if the server is creating a round that's OLDER than our
      // current round, this is a stale event — ignore it.
      if (currentRoundId.current && round && roundCtx.number < round.number) {
        // Only ignore if the roundId is different (server moved ahead)
        if (roundCtx.roundId !== currentRoundId.current) {
          warn(
            `[RoundLifecycle] Stale ROUND_CREATED for round ${roundCtx.number} (current: ${round.number}) — ignoring`
          );
          return;
        }
      }

      setRound(roundCtx);
      setRoundResult(null); // Clear previous round result
      setAssetsReady(false);
      currentRoundId.current = roundCtx.roundId;
      roundReadySent.current = null; // Reset ready state for new round

      // Preload assets and send ROUND_READY
      await preloadAndReady(roundCtx);
    },
    [matchId, preloadAndReady, round]
  );

  // Handle ROUND_STARTED — server started the round
  const handleRoundStarted = useCallback(
    (data: any) => {
      if (data.matchId !== matchId) return;
      if (data.eventId && processedEvents.current.has(data.eventId)) return;
      if (data.eventId) processedEvents.current.add(data.eventId);

      const incomingRoundId = data.round?.roundId;
      // If server started a different round than what we have, adopt it
      if (incomingRoundId && incomingRoundId !== currentRoundId.current) {
        warn(
          `[RoundLifecycle] ROUND_STARTED for round we don't track (${incomingRoundId}) — adopting server context`
        );
        currentRoundId.current = incomingRoundId;
        if (data.round) setRound(data.round);
      } else {
        setRound((prev) =>
          prev
            ? { ...prev, status: "ACTIVE", roundId: data.round?.roundId || prev.roundId }
            : prev
        );
      }
    },
    [matchId]
  );

  // Handle ROUND_FINISHED — round completed with result
  const handleRoundFinished = useCallback(
    (data: any) => {
      if (data.matchId !== matchId) return;
      if (data.eventId && processedEvents.current.has(data.eventId)) return;
      if (data.eventId) processedEvents.current.add(data.eventId);

      // Only process if this is the current round
      if (data.round?.roundId && data.round.roundId !== currentRoundId.current) {
        warn(
          `[RoundLifecycle] ROUND_FINISHED for non-current round (${data.round.roundId}) — ignoring`
        );
        return;
      }

      setRoundResult(data.result);
      setRound((prev) =>
        prev ? { ...prev, status: "FINISHED" } : prev
      );
    },
    [matchId]
  );

  // Handle MATCH_FINISHED — entire match completed
  const handleMatchFinished = useCallback(
    (data: any) => {
      if (data.matchId !== matchId) return;
      if (data.eventId && processedEvents.current.has(data.eventId)) return;
      if (data.eventId) processedEvents.current.add(data.eventId);

      setMatchResult(data.result);
    },
    [matchId]
  );

  // Register DeviceEventEmitter listeners (same pattern as other game events)
  useEffect(() => {
    const sub1 = DeviceEventEmitter.addListener("GAME_ROUND_CREATED", handleRoundCreated);
    const sub2 = DeviceEventEmitter.addListener("GAME_ROUND_STARTED", handleRoundStarted);
    const sub3 = DeviceEventEmitter.addListener("GAME_ROUND_FINISHED", handleRoundFinished);
    const sub4 = DeviceEventEmitter.addListener("GAME_MATCH_FINISHED", handleMatchFinished);

    return () => {
      sub1.remove();
      sub2.remove();
      sub3.remove();
      sub4.remove();
    };
  }, [handleRoundCreated, handleRoundStarted, handleRoundFinished, handleMatchFinished]);

  // ── Reconnect handling ──────────────────────────────────────────────
  // On reconnect, CONNECT_ACK carries the authoritative round context.
  // We must:
  //   1. Clear processedEvents so the same events can be re-processed
  //   2. Adopt the server's round context (it's always correct)
  //   3. Re-send ROUND_READY if the round is still LOADING/WAITING
  //   4. Skip ROUND_READY if the round is already ACTIVE or FINISHED
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("GAME_ENGINE_CONNECT", (event: any) => {
      if (event.matchId !== matchId) return;

      const roundCtx = event.data?.round;
      if (!roundCtx) return;

      // 1. Clear stale event tracking — we're on a fresh connection
      processedEvents.current.clear();

      // 2. Adopt server's authoritative round context
      const serverRoundId = roundCtx.roundId;
      const serverRoundNumber = roundCtx.number;
      const serverRoundStatus = roundCtx.status;

      warn(
        `[RoundLifecycle] Reconnect: server round ${serverRoundNumber}/${roundCtx.total} status=${serverRoundStatus}`
      );

      // 3. If server is on a DIFFERENT round than what we had, full reset
      if (serverRoundId !== currentRoundId.current) {
        setRoundResult(null); // Clear old round's result
      }

      currentRoundId.current = serverRoundId;
      setRound(roundCtx);
      setAssetsReady(false);

      // 4. Preload assets and conditionally send ROUND_READY
      preloadAndReady(roundCtx);
    });
    return () => sub.remove();
  }, [matchId, preloadAndReady]);

  return {
    /** Current round context (null for single-round games until backend sends it) */
    round,

    /** Whether the last round's result is available */
    roundResult,

    /** Whether the entire match result is available */
    matchResult,

    /** Whether assets for the current round are loaded */
    assetsReady,

    /** Whether to show "Round X/Y" in UI */
    showRoundLabel: (round?.total ?? configuredRounds) > 1,

    /** Current round number (1-indexed) */
    currentRoundNumber: round?.number ?? 1,

    /** Total rounds configured */
    totalRounds: round?.total ?? configuredRounds,

    /** Current round status */
    roundStatus: round?.status ?? "WAITING",

    /** Whether match is fully finished */
    isMatchFinished: matchResult !== null,
  };
}
