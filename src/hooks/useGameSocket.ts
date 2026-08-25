/**
 * useGameSocket — shared socket lifecycle for all game runtimes.
 *
 * Boundary (frozen — do not add game-specific logic):
 *   Hook owns:  connection, auth, JOIN, READY, CONNECT_ACK, START, SYNC,
 *               GAME_OVER, PAUSE, ERROR, revision, cleanup
 *   Runtime owns: game state, rendering, animation, game-specific commands,
 *               score computation, game-specific events
 *
 * Security: the hook is a connection lifecycle manager, not a game engine.
 * Backend plugin validates all commands. The frontend never decides legality.
 */

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { DeviceEventEmitter } from "react-native";
import { createGameEngineSocket } from "../services/accountSocketClient";
import type { HtmlGameResult, PlayerContext } from "../games/types";
import { warn } from "../utils/logger";

// ── Socket events (shared across all games) ──────────────────────────────

export const GAME_EVENTS = {
  JOIN: "JOIN",
  READY: "READY",
  MOVE: "MOVE",
  LEAVE: "LEAVE",
  CONNECT_ACK: "CONNECT",
  START: "START",
  STATE: "STATE",
  SYNC: "SYNC",
  GAME_OVER: "GAME_OVER",
  ERROR: "ERROR",
  PAUSE: "PAUSE",
  CHAT: "CHAT",
  ROUND_READY: "ROUND_READY",
} as const;

// ── Types ────────────────────────────────────────────────────────────────

/**
 * Game status — single source of truth for all status values.
 * Backend sends: "WAITING" | "ACTIVE" | "PAUSED" | "FINISHED"
 * Client maps to: "connecting" | "waiting" | "active" | "paused" | "finished"
 */
export type GameStatus = "connecting" | "waiting" | "active" | "paused" | "finished";
export type ExternalPhase = "waiting" | "playing";

export interface UseGameSocketOptions {
  matchId: string;
  userId: string;
  wsToken: string;
  externalPhase?: ExternalPhase;
  onComplete: (result: HtmlGameResult) => void;

  /** Called when CONNECT_ACK arrives. Extract game-specific initial state. */
  onConnectAck?: (data: any) => Record<string, any> | void;
  /** Called when START arrives (match transitions to ACTIVE). */
  onStart?: (data: any) => void;
  /** Called on every SYNC with plugin state + revision. */
  onSync?: (pluginState: any, revision: number) => void;
  /** Called when a CHAT message arrives. */
  onChat?: (data: any) => void;
  /** Called when revision gap detected. Runtime should request FULL_SYNC. */
  onRevisionGap?: (expected: number, received: number) => void;
}

export interface UseGameSocketReturn {
  socket: any;
  status: GameStatus;
  players: PlayerContext[];
  me: PlayerContext | null;
  revision: number;
  initialState: Record<string, any> | null;
  sendCommand: (type: string, payload?: Record<string, any>) => void;
  needsFullSync: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function mapBackendStatus(backendStatus?: string): GameStatus {
  switch (backendStatus) {
    case "ACTIVE": return "active";
    case "PAUSED": return "paused";
    case "FINISHED": return "finished";
    case "WAITING": return "waiting";
    default: return "waiting";
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useGameSocket({
  matchId,
  userId,
  wsToken,
  externalPhase = "waiting",
  onComplete,
  onConnectAck,
  onStart,
  onSync,
  onChat,
  onRevisionGap,
}: UseGameSocketOptions): UseGameSocketReturn {
  const [socket, setSocket] = useState<any>(null);
  const [status, setStatus] = useState<GameStatus>("connecting");
  const [players, setPlayers] = useState<PlayerContext[]>([]);
  const [me, setMe] = useState<PlayerContext | null>(null);
  const [revision, setRevision] = useState(0);
  const [initialState, setInitialState] = useState<Record<string, any> | null>(null);
  const [needsFullSync, setNeedsFullSync] = useState(false);

  // ── Refs (avoid stale closures in socket listeners) ──────────────────
  const statusRef = useRef(status); statusRef.current = status;
  const externalPhaseRef = useRef(externalPhase); externalPhaseRef.current = externalPhase;
  const onCompleteRef = useRef(onComplete); onCompleteRef.current = onComplete;
  const onConnectAckRef = useRef(onConnectAck); onConnectAckRef.current = onConnectAck;
  const onStartRef = useRef(onStart); onStartRef.current = onStart;
  const onSyncRef = useRef(onSync); onSyncRef.current = onSync;
  const onChatRef = useRef(onChat); onChatRef.current = onChat;
  const onRevisionGapRef = useRef(onRevisionGap); onRevisionGapRef.current = onRevisionGap;
  const readySentRef = useRef(false);
  const pendingStartRef = useRef<any>(null);
  const [readyTick, setReadyTick] = useState(0);
  const revisionRef = useRef(0);
  const roundIdRef = useRef<string | null>(null);
  const matchIdRef = useRef(matchId); matchIdRef.current = matchId;
  const connectedMatchRef = useRef<string | null>(null); // keyed by matchId

  // ── Player extraction ────────────────────────────────────────────────
  const extractPlayers = useCallback((data: any): PlayerContext[] => {
    const md = data?.state?.metadata || {};
    const nested = md.matchMetadata || {};
    const raw: any[] = nested.playerSnapshots || md.playerSnapshots || nested.players || md.players || data?.state?.players || [];
    return raw.map((p: any) => ({
      id: p.id || p.userId || "unknown",
      name: p.displayName || p.name || p.username || "Player",
      username: p.username,
      avatar: p.avatar || p.avatarUrl,
      team: p.team,
      seat: p.seat,
      level: p.level ?? (typeof p.xp === "number" ? Math.floor(p.xp / 1000) + 1 : undefined),
    }));
  }, []);

  // ── Socket lifecycle (keyed by matchId + userId) ─────────────────────
  useEffect(() => {
    const lifecycleKey = `${matchId}:${userId}`;

    // Idempotent guard: don't create a second socket for the same match
    if (connectedMatchRef.current === lifecycleKey) return;
    connectedMatchRef.current = lifecycleKey;

    // Reset state for new match
    revisionRef.current = 0;
    setRevision(0);
    setNeedsFullSync(false);

    const s = createGameEngineSocket(matchId, userId, wsToken);
    setSocket(s);

    // ── Named listener functions (for explicit cleanup) ──────────────
    const onConnectAck = (data: any) => {
      const resolvedPlayers = extractPlayers(data);
      setPlayers(resolvedPlayers);
      setMe(resolvedPlayers.find((p) => p.id === userId) || null);

      const gameInitial = onConnectAckRef.current?.(data);
      if (gameInitial && typeof gameInitial === "object") setInitialState(gameInitial);

      setStatus(mapBackendStatus(data?.state?.status));
      readySentRef.current = false;
      setReadyTick((t) => t + 1);

      // Signal game readiness to GamesScreen so the waiting screen
      // transitions from "Loading game…" to "ALL READY!" → playing.
      DeviceEventEmitter.emit("GAME_ENGINE_CONNECT", {
        matchId: matchIdRef.current,
        data,
      });
    };

    const onStart = (data: any) => {
      if (externalPhaseRef.current === "playing") {
        pendingStartRef.current = null;
        setStatus("active");
        onStartRef.current?.(data);
      } else {
        pendingStartRef.current = data;
      }
    };

    const onSync = (data: any) => {
      const incomingRevision = data?.revision ?? data?.sequenceNumber;
      const incomingRoundId = data?.roundId || null;

      // Round changed → reset revision counter (different round = fresh revisions)
      if (incomingRoundId && incomingRoundId !== roundIdRef.current) {
        roundIdRef.current = incomingRoundId;
        revisionRef.current = 0;
      }

      // Revision gap: never apply a patch that skips revisions
      if (incomingRevision != null && incomingRevision > revisionRef.current + 1) {
        const gap = incomingRevision - revisionRef.current;
        warn(`[useGameSocket] Revision gap: expected ${revisionRef.current + 1}, got ${incomingRevision} (gap=${gap})`);

        // Flag full-sync need — the next SYNC with a complete state snapshot
        // will resolve this. Do NOT send FULL_SYNC as a MOVE — the backend
        // plugin rejects unknown move types.
        setNeedsFullSync(true);
        onRevisionGapRef.current?.(revisionRef.current + 1, incomingRevision);
        return; // ← DO NOT apply this SYNC
      }

      // Stale revision: backend is authoritative, but log it
      if (incomingRevision != null && incomingRevision <= revisionRef.current) {
        warn(`[useGameSocket] Stale revision: ${incomingRevision} <= ${revisionRef.current}`);
        // Still apply (backend is authoritative) — but don't increment
      }

      // Missing revision: legacy compatibility — apply + increment
      if (incomingRevision == null) {
        warn("[useGameSocket] Missing server revision — legacy mode. Backend should send revision.");
        revisionRef.current += 1;
      } else {
        revisionRef.current = incomingRevision;
      }
      setRevision(revisionRef.current);

      // Clear full-sync flag once we receive a valid revision
      if (incomingRevision != null) setNeedsFullSync(false);

      onSyncRef.current?.(data?.state, revisionRef.current);
    };

    const onGameOver = (data: any) => {
      setStatus("finished");
      // Delegate to Runtime — no game-specific scores here.
      // Default fallback for Runtimes that don't handle GAME_OVER.
      const ps = data?.state?.pluginState ?? data?.state;
      const winnerId = ps?.winner || data?.winner;
      const isDraw = ps?.drawReason || data?.drawReason;
      const won = winnerId === userId;
      setTimeout(() => onCompleteRef.current({
        score: won ? 1 : 0, won,
        xpEarned: won ? 100 : isDraw ? 30 : 10,
        durationSeconds: 0,
      }), 3000);
    };

    const onPause = (data: any) => {
      setStatus("paused");
      DeviceEventEmitter.emit("GAME_ENGINE_PAUSE", {
        matchId: matchIdRef.current,
        data,
      });
    };

    const onChat = (data: any) => {
      onChatRef.current?.(data);
      // Also bridge to GamesScreen for the shared GameChatPanel
      DeviceEventEmitter.emit("GAME_ENGINE_CHAT", {
        matchId: matchIdRef.current,
        data,
      });
    };
    const onError = (error: any) => warn("[useGameSocket] engine error:", error);

    // ── Attach listeners ────────────────────────────────────────────
    s.on(GAME_EVENTS.CONNECT_ACK, onConnectAck);
    s.on(GAME_EVENTS.START, onStart);
    s.on(GAME_EVENTS.SYNC, onSync);
    s.on(GAME_EVENTS.GAME_OVER, onGameOver);
    s.on(GAME_EVENTS.PAUSE, onPause);
    s.on(GAME_EVENTS.CHAT, onChat);
    s.on(GAME_EVENTS.ERROR, onError);

    // ── Round lifecycle events (bridge to DeviceEventEmitter) ───
    const onRoundCreated = (data: any) => {
      if (data.matchId !== matchIdRef.current) return;
      DeviceEventEmitter.emit("GAME_ROUND_CREATED", data);
    };
    const onRoundStarted = (data: any) => {
      if (data.matchId !== matchIdRef.current) return;
      DeviceEventEmitter.emit("GAME_ROUND_STARTED", data);
    };
    const onRoundFinished = (data: any) => {
      if (data.matchId !== matchIdRef.current) return;
      DeviceEventEmitter.emit("GAME_ROUND_FINISHED", data);
    };
    const onMatchFinished = (data: any) => {
      if (data.matchId !== matchIdRef.current) return;
      DeviceEventEmitter.emit("GAME_MATCH_FINISHED", data);
    };
    s.on("ROUND_CREATED", onRoundCreated);
    s.on("ROUND_STARTED", onRoundStarted);
    s.on("ROUND_FINISHED", onRoundFinished);
    s.on("MATCH_FINISHED", onMatchFinished);

    // ── Intentional leave (from GamesScreen exit button) ────────────
    // Sends LEAVE to the server → immediate forfeit, no reconnect window.
    // This is DIFFERENT from disconnect: LEAVE = player chose to leave,
    // disconnect = connection lost (gives rejoin grace period).
    const subLeave = DeviceEventEmitter.addListener("GAME_LEAVE", () => {
      s.emit(GAME_EVENTS.LEAVE);
      // Disconnect after sending LEAVE so the server processes it first
      setTimeout(() => s.disconnect(), 200);
    });

    // ── Cleanup (explicit — no offAny) ──────────────────────────────
    return () => {
      connectedMatchRef.current = null;

      subLeave.remove();

      // 1. Remove every listener by name
      s.off(GAME_EVENTS.CONNECT_ACK, onConnectAck);
      s.off(GAME_EVENTS.START, onStart);
      s.off(GAME_EVENTS.SYNC, onSync);
      s.off(GAME_EVENTS.GAME_OVER, onGameOver);
      s.off(GAME_EVENTS.PAUSE, onPause);
      s.off(GAME_EVENTS.CHAT, onChat);
      s.off(GAME_EVENTS.ERROR, onError);
      s.off("ROUND_CREATED", onRoundCreated);
      s.off("ROUND_STARTED", onRoundStarted);
      s.off("ROUND_FINISHED", onRoundFinished);
      s.off("MATCH_FINISHED", onMatchFinished);

      // 2. Disconnect
      s.disconnect();

      // 3. Clear pending state
      pendingStartRef.current = null;
      readySentRef.current = false;

      // 4. Signal overlay cleanup
      DeviceEventEmitter.emit("GAME_ENGINE_DISCONNECT", { matchId: matchIdRef.current });
    };
  }, [matchId, userId, wsToken, extractPlayers]); // deps are stable — refs handle callbacks

  // ── READY gate ────────────────────────────────────────────────────────
  useEffect(() => {
    if (externalPhase !== "playing" || readySentRef.current || !socket) return;
    readySentRef.current = true;
    socket.emit(GAME_EVENTS.READY);
  }, [externalPhase, socket, readyTick]);

  // ── Apply pending START when countdown finishes ───────────────────────
  useEffect(() => {
    if (externalPhase !== "playing") return;
    if (pendingStartRef.current !== null) {
      onStartRef.current?.(pendingStartRef.current);
      pendingStartRef.current = null;
    }
    setStatus((prev) => prev === "finished" || prev === "paused" ? prev : "active");
  }, [externalPhase]);

  // ── Send command (generic — backend validates legality) ────────────────
  const sendCommand = useCallback(
    (type: string, payload: Record<string, any> = {}) => {
      if (statusRef.current !== "active") return;
      socket?.emit(type, payload);
    },
    [socket],
  );

  return useMemo(
    () => ({ socket, status, players, me, revision, initialState, sendCommand, needsFullSync }),
    [socket, status, players, me, revision, initialState, sendCommand, needsFullSync],
  );
}
