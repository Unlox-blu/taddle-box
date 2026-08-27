/**
 * LudoRuntime — game-specific state for ludo.
 * Uses shared useGameSocket for socket lifecycle.
 * Chat + game state use raw socket (needs playerInfoRef, gameStateRef for popups).
 */

import React, { useEffect, useState, useRef, useCallback } from "react";
import { Platform } from "react-native";
import { useGameSocket, GAME_EVENTS, type ExternalPhase } from "../../../../hooks/useGameSocket";
import { getSessionAvatar } from "../../../../services/sessionAvatarCache";
import type { HtmlGameResult, PlayerContext } from "../../../../games/types";
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
  const [noMoveHold, setNoMoveHold] = useState<{ playerIdx: number; face: number } | null>(null);

  // ── Chat state ─────────────────────────────────────────────────────
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ id: number; uid?: string; name: string; color: string; text: string; time: string }>>([]);
  const [draft, setDraft] = useState("");
  const [chatPopups, setChatPopups] = useState<Array<{ id: number; uid: string; name: string; text: string; color: string; cornerIdx: number }>>([]);

  // ── Effects ────────────────────────────────────────────────────────
  const [bursts, setBursts] = useState<Array<{ id: number; x: number; y: number; color: string }>>([]);
  const burstIdRef = useRef(0);
  const [toast, setToast] = useState<string | null>(null);

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
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
  // Buffered dice result while a tumble animation is running — the result
  // arrives via SYNC but is applied only when the tumble finishes, so the
  // dice face reveal syncs with the animation completion.
  const pendingDiceRef = useRef<{ face: number; turnIndex: number } | null>(null);

  // ── Keyboard ───────────────────────────────────────────────────────
  const [kbH, setKbH] = useState(0);
  const kbLift = Platform.OS === "ios" ? kbH : 0;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, []);

  const doReveal = useCallback(() => {
    if (pendingTurnRef.current != null) {
      setDisplayTurn(pendingTurnRef.current);
      pendingTurnRef.current = null;
    }
  }, []);

  const revealPendingTurn = useCallback(() => {
    if (revealTimerRef.current) { clearTimeout(revealTimerRef.current); revealTimerRef.current = null; }
    if (pendingTurnRef.current == null) return;
    revealTimerRef.current = setTimeout(() => { revealTimerRef.current = null; doReveal(); }, 2000);
  }, [doReveal]);

  const maybeRevealTurn = useCallback(() => {
    if (activeWalksRef.current <= 0) revealPendingTurn();
  }, [revealPendingTurn]);

  // ── Shared socket hook ─────────────────────────────────────────────
  const { socket, status: hookStatus, sendCommand } = useGameSocket({
    matchId, userId, wsToken, externalPhase, onComplete,
    onConnectAck: (data) => {
      const ps = data.state?.pluginState;
      const enginePlayers: any[] = extractEnginePlayers(data);
      const idx = enginePlayers.findIndex((p: any) => p.userId === userId || p.id === userId);
      const engineSeat = ps?.turnOrder?.indexOf(userId) ?? -1;
      setMyPlayerIdx(engineSeat >= 0 ? engineSeat : idx >= 0 ? idx : 0);
      const info = buildPlayerInfo(enginePlayers);
      info[userId] = { name: myName, avatar: myAvatar || undefined, level: myLevel };
      setPlayerInfo(info);
      if (ps) setGameState(ps);
      return {};
    },
    onStart: (data) => {
      const ps = data.state?.pluginState ?? data.state;
      if (ps) { setGameState(ps); setDisplayTurn(ps.currentTurnIndex ?? 0); }
    },
    onSync: (pluginState) => {
      if (!pluginState) return;
      setGameState((prev: any) => prev ? { ...prev, ...pluginState } : pluginState);
      if (pluginState.currentTurnIndex != null) {
        pendingTurnRef.current = pluginState.currentTurnIndex;
        maybeRevealTurn();
      }
      if (pluginState.dice != null) {
        // Determine who rolled — the roller is the player whose turn it was
        // when the ROLL was processed (currentTurnIndex hasn't advanced yet
        // for a successful roll).
        const turnOrder = pluginState.turnOrder || gameStateRef.current?.turnOrder || [];
        const rollerIdx = pluginState.currentTurnIndex ?? 0;
        const rollerId = turnOrder[rollerIdx];
        const isRemoteRoll = rollerId != null && rollerId !== userId;

        if (rollingRef.current) {
          // Own roll — the tumble animation is running; buffer the result so
          // the dice face is revealed only when the animation completes.
          pendingDiceRef.current = { face: pluginState.dice, turnIndex: pluginState.currentTurnIndex };
        } else if (isRemoteRoll) {
          // Remote player rolled — buffer the result and signal the game to
          // start the remote tumble animation.
          pendingDiceRef.current = { face: pluginState.dice, turnIndex: pluginState.currentTurnIndex };
          setRemoteRolling(rollerId);
        } else {
          // Fallback / reconnect — apply the dice face immediately.
          setDicePreview(pluginState.dice);
          setSettledFace(pluginState.dice);
        }
      }
      if (pluginState.lastDice != null && pluginState.dice == null) setSettledFace(pluginState.lastDice);
    },
    onChat: (data) => {
      const info = playerInfoRef.current[data.uid] || playerInfoRef.current[data.userId];
      const senderName = info?.name || data.name || "Player";
      const senderColor = PLAYER_COLORS[(gameStateRef.current?.turnOrder || []).indexOf(data.userId || data.uid) % 4] || "#94A3B8";
      setMessages((prev) => [...prev.slice(-50), {
        id: Date.now() + Math.random(), uid: data.userId || data.uid,
        name: senderName, color: senderColor, text: data.text,
        time: new Date(data.ts || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }]);
      const cornerIdx = (gameStateRef.current?.turnOrder || []).indexOf(data.userId || data.uid);
      if (cornerIdx >= 0) {
        const popupId = Date.now();
        setChatPopups((prev) => [...prev.slice(-3), { id: popupId, uid: data.userId || data.uid, name: senderName, text: data.text, color: senderColor, cornerIdx }]);
        setTimeout(() => setChatPopups((prev) => prev.filter((p) => p.id !== popupId)), 4000);
      }
    },
  });

  // Sync status from hook to local (hook has "paused", local doesn't)
  useEffect(() => {
    if (hookStatus === "active" || hookStatus === "waiting") setStatus(hookStatus);
    else if (hookStatus === "finished") setStatus("finished");
  }, [hookStatus]);

  // ── Actions ────────────────────────────────────────────────────────
  const handleRoll = useCallback(() => {
    if (status !== "active") return;
    setRolling(true);
    sendCommand(GAME_EVENTS.MOVE, { type: "ROLL" });
  }, [status, sendCommand]);

  const handleTokenTap = useCallback((tokenId: number) => {
    if (status !== "active") return;
    sendCommand(GAME_EVENTS.MOVE, { type: "MOVE_TOKEN", tokenId });
  }, [status, sendCommand]);

  const sendChat = useCallback((text: string) => {
    if (!text.trim() || !socket) return;
    socket.emit(GAME_EVENTS.CHAT, { text: text.trim().slice(0, 200) });
  }, [socket]);

  // ── Keyboard listener ──────────────────────────────────────────────
  useEffect(() => {
    const { Keyboard } = require("react-native");
    const showSub = Keyboard.addListener("keyboardDidShow", (e: any) => setKbH(e.endCoordinates?.height || 0));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKbH(0));
    return () => { showSub?.remove(); hideSub?.remove(); };
  }, []);

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

  const isMyTurn = displayTurn === myPlayerIdx;

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
      chatOpen={chatOpen} setChatOpen={setChatOpen} messages={messages}
      draft={draft} setDraft={setDraft} chatPopups={chatPopups}
      setChatPopups={setChatPopups} setMessages={setMessages}
      bursts={bursts} setBursts={setBursts} burstIdRef={burstIdRef}
      toast={toast} setToast={setToast} kbH={kbH} kbLift={kbLift}
      pendingTurnRef={pendingTurnRef} revealTimerRef={revealTimerRef}
      activeWalksRef={activeWalksRef} pendingKeysRef={pendingKeysRef}
      onRoll={handleRoll} onTokenTap={handleTokenTap} onSendChat={sendChat}
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
