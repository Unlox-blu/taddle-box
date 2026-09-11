/**
 * LudoRuntime — game-specific state for ludo.
 * Uses shared useGameSocket for socket lifecycle.
 * Chat + game state use raw socket (needs playerInfoRef, gameStateRef for popups).
 */

import React, { useEffect, useState, useRef, useCallback } from "react";
import { Platform } from "react-native";
import { useGameSocket, GAME_EVENTS, type ExternalPhase } from "../../hooks/useGameSocket";
import { getSessionAvatar } from "../../../../infrastructure/storage/session-avatar-cache";
import type { HtmlGameResult, PlayerContext } from "../game-runtime.types";
import LudoGame from "./LudoGame";

const PLAYER_COLORS = ["#E32636", "#009E60", "#FFC000", "#007FFF"];

interface LudoRuntimeProps {
  matchId: string;
  userId: string;
  wsToken: string;
  players?: PlayerContext[];
  myName?: string;
  myAvatar?: string | null;
  myLevel?: number;
  externalPhase?: ExternalPhase;
  onComplete: (result: HtmlGameResult) => void;
  /** Resolved game assets from the asset manifest system (key → local URI). */
  assets?: Record<string, string>;
}

export default function LudoRuntime({
  matchId, userId, wsToken, players,
  myName: myNameProp, myAvatar: myAvatarProp, myLevel,
  externalPhase = "waiting", onComplete,
}: LudoRuntimeProps) {
  const me = players?.find((p) => p.id === userId);
  const myName = myNameProp || me?.name || "You";
  const myAvatar = myAvatarProp || me?.avatar || null;

  // ── Game state ─────────────────────────────────────────────────────
  const [status, setStatus] = useState<"connecting" | "waiting" | "active" | "finished">("connecting");
  const [gameState, setGameState] = useState<any>(null);
  const [myPlayerIdx, setMyPlayerIdx] = useState(0);
  const [displayTurn, setDisplayTurn] = useState(0);
  const [playerInfo, setPlayerInfo] = useState<Record<string, { name: string; avatar?: string; level?: number }>>({});

  // ── Dice state ─────────────────────────────────────────────────────
  const [rolling, setRolling] = useState(false);
  const [remoteRolling, setRemoteRolling] = useState<string | null>(null);
  const [dicePreview, setDicePreview] = useState<number | null>(null);
  const [settledFace, setSettledFace] = useState<number | null>(null);
  const [diceOwnerIdx, setDiceOwnerIdx] = useState<number | null>(null);
  const [turnDeadlineAt, setTurnDeadlineAt] = useState<number | null>(null);
  const [turnTimerVisibleAt, setTurnTimerVisibleAt] = useState<number | null>(null);
  const [noMoveHold, setNoMoveHold] = useState<{ playerIdx: number; face: number } | null>(null);

  // ── Chat state ─────────────────────────────────────────────────────

  const [chatPopups, setChatPopups] = useState<Array<{ id: number; uid: string; name: string; text: string; color: string; cornerIdx: number }>>([]);

  // ── Effects ────────────────────────────────────────────────────────
  const [bursts, setBursts] = useState<Array<{ id: number; x: number; y: number; color: string }>>([]);
  const burstIdRef = useRef(0);
  const [toast, setToast] = useState<string | null>(null);

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const gameRevisionRef = useRef(0);
  const pendingTimerRef = useRef<{ playerId: string; turnIndex: number; revision: number; deadlineAt: number; visibleAt: number } | null>(null);
  const activeTimerRef = useRef<{ playerId: string; turnIndex: number } | null>(null);
  const playerInfoRef = useRef(playerInfo);
  playerInfoRef.current = playerInfo;

  // ── Turn reveal ────────────────────────────────────────────────────
  const pendingTurnRef = useRef<number | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeWalksRef = useRef(0);
  const pendingKeysRef = useRef(new Set<string>());

  // ── Dice animation refs ────────────────────────────────────────────
  const rollingRef = useRef(false);
  rollingRef.current = rolling;
  const remoteRollingRef = useRef<string | null>(null);
  remoteRollingRef.current = remoteRolling;
  const lastDiceSeenRef = useRef<number | null>(null);
  // Buffered dice result while a tumble animation is running — the result
  // arrives via SYNC but is applied only when the tumble finishes, so the
  // dice face reveal syncs with the animation completion.
  const pendingDiceRef = useRef<{ face: number; turnIndex: number } | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, []);

  // ── Shared socket hook ─────────────────────────────────────────────
  const { socket, status: hookStatus, sendCommand } = useGameSocket({
    matchId, userId, wsToken, externalPhase, onComplete,
    onConnectAck: (data) => {
      const ps = data.state?.pluginState;
      gameRevisionRef.current = data.state?.currentRevision ?? 0;
      if (data.turnTimer) {
        pendingTimerRef.current = {
          ...data.turnTimer,
          visibleAt: data.turnTimer.deadlineAt - Math.max(0, (data.turnTimer.durationMs ?? 10000) - 5000),
        };
      }
      const enginePlayers: any[] = extractEnginePlayers(data);
      const idx = enginePlayers.findIndex((p: any) => p.userId === userId || p.id === userId);
      const engineSeat = ps?.turnOrder?.indexOf(userId) ?? -1;
      setMyPlayerIdx(engineSeat >= 0 ? engineSeat : idx >= 0 ? idx : 0);
      const info = buildPlayerInfo(enginePlayers);
      info[userId] = { name: myName, avatar: myAvatar || undefined, level: myLevel };
      setPlayerInfo(info);
      if (ps) {
        lastDiceSeenRef.current = ps.lastDice ?? null;
        gameStateRef.current = ps;
        setDiceOwnerIdx(ps.dice != null ? ps.currentTurnIndex : null);
        setGameState(ps);
        const timer = pendingTimerRef.current;
        if (
          timer &&
          timer.revision <= gameRevisionRef.current &&
          ps.turnOrder?.[ps.currentTurnIndex] === timer.playerId &&
          ps.currentTurnIndex === timer.turnIndex
        ) {
          setTurnDeadlineAt(timer.deadlineAt);
          setTurnTimerVisibleAt(timer.visibleAt);
          activeTimerRef.current = { playerId: timer.playerId, turnIndex: timer.turnIndex };
          pendingTimerRef.current = null;
        }
      }
      return {};
    },
    onStart: (data) => {
      const ps = data.state?.pluginState ?? data.state;
      gameRevisionRef.current = data.state?.currentRevision ?? gameRevisionRef.current;
      if (ps) {
        gameStateRef.current = ps;
        setDiceOwnerIdx(ps.dice != null ? ps.currentTurnIndex : null);
        setGameState(ps);
        setDisplayTurn(ps.currentTurnIndex ?? 0);
      }
    },
    onSync: (pluginState, revision, event) => {
      if (!pluginState) return;
      gameRevisionRef.current = revision;
      gameStateRef.current = { ...(gameStateRef.current || {}), ...pluginState };
      setGameState((prev: any) => prev ? { ...prev, ...pluginState } : pluginState);
      if (pluginState.currentTurnIndex != null) {
        pendingTurnRef.current = pluginState.currentTurnIndex;
      }
      const lastDiceChanged =
        pluginState.lastDice != null && pluginState.lastDice !== lastDiceSeenRef.current;
      if (pluginState.lastDice != null) lastDiceSeenRef.current = pluginState.lastDice;

      const currentTurnIndex = pluginState.currentTurnIndex ?? 0;
      if (pluginState.dice != null) {
        setDiceOwnerIdx(currentTurnIndex);
      } else if (lastDiceChanged && pluginState.turnOrder?.length) {
        setDiceOwnerIdx((currentTurnIndex - 1 + pluginState.turnOrder.length) % pluginState.turnOrder.length);
      } else {
        setDiceOwnerIdx(null);
      }

      if (pluginState.dice != null || lastDiceChanged) {
        // Determine who rolled — the roller is the player whose turn it was
        // when the ROLL was processed. A roll with no legal move advances the
        // turn immediately, so its roller is the previous turn-order entry.
        const turnOrder = pluginState.turnOrder || gameStateRef.current?.turnOrder || [];
        const rollerIdx = pluginState.dice != null
          ? currentTurnIndex
          : (currentTurnIndex - 1 + turnOrder.length) % turnOrder.length;
        const rollerId = turnOrder[rollerIdx];
        const isRemoteRoll = rollerId != null && rollerId !== userId;
        const isTimeoutRoll = event?.reason === "turn_timeout" && event?.timedOutPlayer === rollerId;
        const face = pluginState.dice ?? pluginState.lastDice;

        if (rollingRef.current) {
          // Own roll — the tumble animation is running; buffer the result so
          // the dice face is revealed only when the animation completes.
          pendingDiceRef.current = { face, turnIndex: currentTurnIndex };
        } else if (isRemoteRoll || isTimeoutRoll) {
          // Remote player rolled — buffer the result and signal the game to
          // start the remote tumble animation.
          pendingDiceRef.current = { face, turnIndex: currentTurnIndex };
          setRemoteRolling(rollerId);
        } else {
          // Fallback / reconnect — apply the dice face immediately.
          setDicePreview(face);
          setSettledFace(face);
        }
      }
      const timer = pendingTimerRef.current;
      if (
        timer &&
        timer.revision <= revision &&
        pluginState.turnOrder?.[pluginState.currentTurnIndex] === timer.playerId &&
        pluginState.currentTurnIndex === timer.turnIndex
      ) {
        setTurnDeadlineAt(timer.deadlineAt);
        setTurnTimerVisibleAt(timer.visibleAt);
        activeTimerRef.current = { playerId: timer.playerId, turnIndex: timer.turnIndex };
        pendingTimerRef.current = null;
      }
    },
    onTurnTimer: (data) => {
      if (data.clear) {
        pendingTimerRef.current = null;
        activeTimerRef.current = null;
        setTurnDeadlineAt(null);
        setTurnTimerVisibleAt(null);
        return;
      }
      if (!data.playerId || data.turnIndex == null || data.deadlineAt == null) return;
      const revision = data.revision ?? 0;
      if (revision < gameRevisionRef.current) return;

      // A new backend timer invalidates the previous display immediately.
      // Keep the new timer pending until its matching SYNC arrives.
      setTurnDeadlineAt(null);
      setTurnTimerVisibleAt(null);
      activeTimerRef.current = null;

      const timer = {
        playerId: data.playerId,
        turnIndex: data.turnIndex,
        revision,
        deadlineAt: data.deadlineAt,
        visibleAt: data.deadlineAt - Math.max(0, (data.durationMs ?? 10000) - 5000),
      };
      pendingTimerRef.current = timer;
      const state = gameStateRef.current;
      if (
        state?.turnOrder?.[state.currentTurnIndex] === timer.playerId &&
        state.currentTurnIndex === timer.turnIndex &&
        timer.revision <= gameRevisionRef.current
      ) {
        setTurnDeadlineAt(timer.deadlineAt);
        setTurnTimerVisibleAt(timer.visibleAt);
        activeTimerRef.current = { playerId: timer.playerId, turnIndex: timer.turnIndex };
        pendingTimerRef.current = null;
      }
    },
    onChat: (data) => {
      const info = playerInfoRef.current[data.uid] || playerInfoRef.current[data.userId];
      const senderName = info?.name || data.name || "Player";
      const senderColor = PLAYER_COLORS[(gameStateRef.current?.turnOrder || []).indexOf(data.userId || data.uid) % 4] || "#94A3B8";

      const cornerIdx = (gameStateRef.current?.turnOrder || []).indexOf(data.userId || data.uid);
      if (cornerIdx >= 0) {
        const popupId = Date.now();
        setChatPopups((prev) => [...prev.slice(-3), { id: popupId, uid: data.userId || data.uid, name: senderName, text: data.text, color: senderColor, cornerIdx }]);
        setTimeout(() => setChatPopups((prev) => prev.filter((p) => p.id !== popupId)), 4000);
      }
      
      const uid = data.userId || data.uid;
      if (uid !== userId) {
        require("react-native").DeviceEventEmitter.emit("GAME_ENGINE_CHAT", { name: senderName, text: data.text });
      }
    },
  });

  useEffect(() => {
    const activeTimer = activeTimerRef.current;
    const state = gameStateRef.current;
    if (
      activeTimer &&
      state &&
      (state.turnOrder?.[state.currentTurnIndex] !== activeTimer.playerId ||
        state.currentTurnIndex !== activeTimer.turnIndex)
    ) {
      activeTimerRef.current = null;
      pendingTimerRef.current = null;
      setTurnDeadlineAt(null);
      setTurnTimerVisibleAt(null);
    }
  }, [gameState]);

  // Sync status from hook to local (hook has "paused", local doesn't)
  useEffect(() => {
    if (hookStatus === "active" || hookStatus === "waiting") setStatus(hookStatus);
    else if (hookStatus === "finished") setStatus("finished");
  }, [hookStatus]);

  // ── Actions ────────────────────────────────────────────────────────
  const handleRoll = useCallback(() => {
    if (status !== "active") return;
    const state = gameStateRef.current;
    if (state?.currentTurnIndex != null) setDiceOwnerIdx(state.currentTurnIndex);
    setRolling(true);
    sendCommand(GAME_EVENTS.MOVE, { type: "ROLL" });
  }, [status, sendCommand]);

  const handleTokenTap = useCallback((tokenId: number) => {
    if (status !== "active") return;
    sendCommand(GAME_EVENTS.MOVE, { type: "MOVE_TOKEN", tokenId });
  }, [status, sendCommand]);

  // Listen to the global GameChatPanel sending out messages
  useEffect(() => {
    const sub = require("react-native").DeviceEventEmitter.addListener("GAME_PANEL_OUTGOING_CHAT", (text: string) => {
      if (!text.trim() || !socket) return;
      socket.emit(GAME_EVENTS.CHAT, { text: text.trim().slice(0, 200) });
    });
    return () => sub.remove();
  }, [socket]);



  useEffect(() => () => { if (revealTimerRef.current) clearTimeout(revealTimerRef.current); }, []);

  // ── Dice preview cycling — random face while tumble is running ────
  useEffect(() => {
    if (!rolling && !remoteRolling) return;
    const id = setInterval(() => setDicePreview(1 + Math.floor(Math.random() * 6)), 110);
    return () => clearInterval(id);
  }, [rolling, remoteRolling]);

  // ── Dice tumble completion callbacks ───────────────────────────────
  // Called by LudoGame when a tumble animation finishes. Applies the
  // buffered dice result and clears the rolling/remoteRolling state.
  const onRollComplete = useCallback(() => {
    const pending = pendingDiceRef.current;
    if (pending) {
      setDicePreview(pending.face);
      setSettledFace(pending.face);
      pendingDiceRef.current = null;
    }
    setRolling(false);
  }, []);

  const onRemoteRollComplete = useCallback(() => {
    const pending = pendingDiceRef.current;
    if (pending) {
      setDicePreview(pending.face);
      setSettledFace(pending.face);
      pendingDiceRef.current = null;
    }
    setRemoteRolling(null);
  }, []);

  const backendOwnsTurn = gameState?.turnOrder?.[gameState?.currentTurnIndex] === userId;
  const isMyTurn = backendOwnsTurn && displayTurn === myPlayerIdx;

  return (
    <LudoGame
      matchId={matchId} userId={userId} players={players}
      myName={myName} myAvatar={myAvatar} myLevel={myLevel} onComplete={onComplete}
      status={status} gameState={gameState} myPlayerIdx={myPlayerIdx}
      displayTurn={displayTurn} setDisplayTurn={setDisplayTurn} isMyTurn={isMyTurn}
      playerInfo={playerInfo}
      rolling={rolling} setRolling={setRolling} remoteRolling={remoteRolling}
      setRemoteRolling={setRemoteRolling} dicePreview={dicePreview}
      settledFace={settledFace} noMoveHold={noMoveHold} setNoMoveHold={setNoMoveHold}
      diceOwnerIdx={diceOwnerIdx}
      turnDeadlineAt={turnDeadlineAt}
      turnTimerVisibleAt={turnTimerVisibleAt}
      chatPopups={chatPopups}
      setChatPopups={setChatPopups}
      bursts={bursts} setBursts={setBursts} burstIdRef={burstIdRef}
      toast={toast} setToast={setToast}
      pendingTurnRef={pendingTurnRef} revealTimerRef={revealTimerRef}
      activeWalksRef={activeWalksRef} pendingKeysRef={pendingKeysRef}
      onRoll={handleRoll} onTokenTap={handleTokenTap}
      onRollComplete={onRollComplete} onRemoteRollComplete={onRemoteRollComplete}
    />
  );
}

function extractEnginePlayers(data: any): any[] {
  const md = data?.state?.metadata || {};
  const nested = md.matchMetadata || {};
  return nested.playerSnapshots || md.playerSnapshots || nested.players || md.players || data?.state?.players || [];
}

function buildPlayerInfo(players: any[]): Record<string, { name: string; username?: string; avatar?: string; level?: number }> {
  const info: Record<string, { name: string; username?: string; avatar?: string; level?: number }> = {};
  players.forEach((p: any) => {
    const uid = p.id || p.userId;
    if (uid) {
      info[uid] = {
        name: p.displayName || p.name || p.username || "Player",
        username: p.username, avatar: p.avatar || p.avatarUrl,
        level: p.level ?? (typeof p.xp === "number" ? Math.floor(p.xp / 1000) + 1 : undefined),
      };
    }
  });
  return info;
}
