/**
 * SnakeLadderRuntime — game-specific state for snake & ladder.
 * Uses shared useGameSocket for socket lifecycle.
 * Sync queue, token animations, chat, auto-roll use raw socket (complex game-specific logic).
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Animated, Platform, Easing } from "react-native";
import { useGameSocket, GAME_EVENTS, type ExternalPhase } from "../../../../hooks/useGameSocket";
import { gameSound, useTurnSound } from "../../../../services/gameSound";
import type { HtmlGameResult, PlayerContext } from "../../../../games/types";
import SnakeLadderGame from "./SnakeLadderGame";

const GRID = 10;
const SNAKES: Record<number, number> = { 99: 80, 95: 75, 92: 88, 89: 58, 74: 53, 62: 19, 64: 60, 46: 25, 49: 11, 16: 6 };
const LADDERS: Record<number, number> = { 87: 94, 78: 98, 71: 91, 51: 67, 36: 44, 21: 42, 28: 84, 15: 26, 2: 38, 7: 14, 8: 31 };
const DICE_ROLL_MS = 2000;
const AUTO_GRACE_MS = 5000;
const AUTO_COUNTDOWN_MS = 5000;
const AUTO_ROLL_MS = AUTO_GRACE_MS + AUTO_COUNTDOWN_MS;
const PLAYER_COLORS = ["#EF4444", "#3B82F6", "#22C55E", "#EAB308"];

type PathPt = { x: number; y: number; ms: number };
type Pt = { x: number; y: number };
type ChatMsg = { id: number; uid?: string; name: string; color: string; text: string; time: string };

function squareToCenter(sq: number): Pt {
  const idx = sq - 1;
  const rawRow = Math.floor(idx / GRID);
  const rawCol = idx % GRID;
  const row = GRID - 1 - rawRow;
  const col = rawRow % 2 === 0 ? rawCol : GRID - 1 - rawCol;
  const cell = 400 / GRID;
  return { x: col * cell + cell / 2, y: row * cell + cell / 2 };
}

function bezierPoint(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const mt = 1 - t;
  return { x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x, y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y };
}

function snakeCurve(headSq: number, tailSq: number, idx: number) {
  const s = squareToCenter(headSq); const e = squareToCenter(tailSq);
  const dx = e.x - s.x; const dy = e.y - s.y; const dist = Math.sqrt(dx * dx + dy * dy);
  const mag = Math.min(46, Math.max(18, dist * 0.35));
  const off = mag * (idx % 2 === 0 ? 1 : -1);
  const mx = (s.x + e.x) / 2; const my = (s.y + e.y) / 2;
  const p1 = { x: mx + off, y: my - mag * 0.3 }; const p2 = { x: mx - off, y: my + mag * 0.3 };
  return { s, e, p1, p2 };
}

const SNAKE_KEYS = Object.keys(SNAKES).map(Number);
function snakeIndexOf(sq: number): number { const i = SNAKE_KEYS.indexOf(sq); return i < 0 ? 0 : i; }

function tilePoints(from: number, to: number, boardSize: number): PathPt[] {
  if (to <= from) return [];
  const count = to - from; const cell = boardSize / GRID;
  const ms = count > 14 ? 190 : 300; const pts: PathPt[] = [];
  for (let sq = from; sq <= to; sq++) {
    const idx = sq - 1; const rawRow = Math.floor(idx / GRID); const rawCol = idx % GRID;
    const row = GRID - 1 - rawRow; const col = rawRow % 2 === 0 ? rawCol : GRID - 1 - rawCol;
    pts.push({ x: col * cell + cell / 2, y: row * cell + cell / 2, ms });
  }
  return pts;
}

function snakePathPoints(headSq: number, tailSq: number, boardSize: number): PathPt[] {
  const { s, e, p1, p2 } = snakeCurve(headSq, tailSq, snakeIndexOf(headSq));
  const pts: PathPt[] = []; const N = 28;
  for (let i = 1; i <= N; i++) { const t = 0.02 + (i / N) * 0.98; const p = bezierPoint(s, p1, p2, e, t); pts.push({ x: p.x, y: p.y, ms: 58 }); }
  return pts;
}

function ladderPathPoints(baseSq: number, topSq: number, boardSize: number): PathPt[] {
  const s = squareToCenter(baseSq); const e = squareToCenter(topSq);
  const dx = e.x - s.x; const dy = e.y - s.y; const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dy / len; const uy = -dx / len; const rail = 5;
  const pts: PathPt[] = []; const N = 9;
  for (let i = 1; i <= N; i++) { const t = 0.05 + (i / N) * 0.9; pts.push({ x: s.x + dx * t + ux * rail, y: s.y + dy * t + uy * rail, ms: 105 }); }
  return pts;
}

interface SnakeLadderRuntimeProps {
  matchId: string; userId: string; wsToken: string;
  players?: PlayerContext[]; myName?: string; myAvatar?: string | null;
  externalPhase?: ExternalPhase; onComplete: (result: HtmlGameResult) => void;
  /** Resolved game assets from the asset manifest system (key → local URI). */
  assets?: Record<string, string>;
  /** Keyboard height passed down from GamesScreen — eliminates the need for a local listener. */
  kbH?: number;
}

function extractEnginePlayers(data: any): any[] {
  const md = data?.state?.metadata || {}; const nested = md.matchMetadata || {};
  return nested.playerSnapshots || md.playerSnapshots || nested.players || md.players || data?.state?.players || [];
}

function buildPlayerInfo(players: any[]): Record<string, { name: string; username?: string; avatar?: string }> {
  const info: Record<string, { name: string; username?: string; avatar?: string }> = {};
  players.forEach((p: any) => { const uid = p.id || p.userId; if (uid) info[uid] = { name: p.displayName || p.name || p.username || "Player", username: p.username, avatar: p.avatar || p.avatarUrl }; });
  return info;
}

export default function SnakeLadderRuntime({
  matchId, userId, wsToken, players, myName: myNameProp, myAvatar: myAvatarProp, externalPhase = "waiting", onComplete,
  kbH: kbHProp = 0,
}: SnakeLadderRuntimeProps) {
  const [status, setStatus] = useState<"connecting" | "waiting" | "active" | "finished">("connecting");
  const [state, setState] = useState<any>(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [remoteRolling, setRemoteRolling] = useState<string | null>(null);
  const [lastDice, setLastDice] = useState<number | null>(null);
  const [dicePreview, setDicePreview] = useState<number | null>(null);
  const [lastLanded, setLastLanded] = useState<number | null>(null);
  const [playerInfo, setPlayerInfo] = useState<Record<string, { name: string; username?: string; avatar?: string }>>({});
  const [autoRoll, setAutoRoll] = useState<null | { remaining: number; target: string; phase: "countdown" | "rolling" }>(null);
  const [chatPopups, setChatPopups] = useState<Array<{ id: number; uid: string; name: string; text: string; color: string }>>([]);
  // kbH is passed down from GamesScreen — no local listener needed.
  const kbH = kbHProp;

  const me = players?.find((p) => p.id === userId);
  const myName = myNameProp || me?.name || "You";
  const myAvatar = myAvatarProp || me?.avatar || null;

  const playersRef = useRef(players); playersRef.current = players;
  const playerInfoRef = useRef(playerInfo); playerInfoRef.current = playerInfo;
  const onCompleteRef = useRef(onComplete); onCompleteRef.current = onComplete;
  const landedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const diceRotate = useRef(new Animated.Value(0)).current;
  const diceAnim = useRef(new Animated.Value(1)).current;
  const toastAnim = useRef(new Animated.Value(0)).current;
  const turnPulse = useRef(new Animated.Value(0)).current;
  const remoteRollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnStartRef = useRef(0);
  const lastTurnKeyRef = useRef("");
  const lastCountRef = useRef(-1);
  const autoRolledRef = useRef<string | null>(null);
  const autoRollFiredRef = useRef(false);
  const stateRef = useRef(state); stateRef.current = state;
  const rollingRef = useRef(false);
  const pendingSyncRef = useRef<{ ps: any; reason?: string } | null>(null);
  const lastSquaresRef = useRef<Record<string, number>>({});
  const animatingRef = useRef<Set<string>>(new Set());
  const tokenAnims = useRef<Record<string, { x: Animated.Value; y: Animated.Value }>>({}).current;

  const getOrCreateTokenAnim = useCallback((uid: string, sq: number) => {
    if (!tokenAnims[uid]) { const c = squareToCenter(Math.max(1, sq)); tokenAnims[uid] = { x: new Animated.Value(c.x), y: new Animated.Value(c.y) }; }
    return tokenAnims[uid];
  }, [tokenAnims]);

  const runTokenPath = useCallback((uid: string, pts: PathPt[]) => {
    const anim = tokenAnims[uid]; if (!anim || pts.length < 2) return;
    if (animatingRef.current.has(uid)) return; animatingRef.current.add(uid);
    const steps = pts.slice(1).map((p) => Animated.parallel([
      Animated.timing(anim.x, { toValue: p.x, duration: p.ms, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      Animated.timing(anim.y, { toValue: p.y, duration: p.ms, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ]));
    Animated.sequence(steps).start(() => animatingRef.current.delete(uid));
  }, [tokenAnims]);

  const showToastFn = useCallback((msg: string) => {
    setToast(msg); toastAnim.setValue(0);
    Animated.sequence([Animated.timing(toastAnim, { toValue: 1, duration: 220, useNativeDriver: true }), Animated.delay(2300), Animated.timing(toastAnim, { toValue: 0, duration: 280, useNativeDriver: true })]).start(() => setToast(null));
  }, [toastAnim]);

  const pName = useCallback((uid: string): string => {
    const p = playersRef.current?.find((x) => x.id === uid) || playerInfoRef.current[uid];
    return uid === userId ? "You" : p?.name || p?.username || "Player";
  }, [userId]);

  const applyStateDelta = useCallback((ps: any, reason?: string) => {
    const positions = ps?.positions || {}; const turnOrder = ps?.turnOrder || [];
    const curIdx = ps?.currentTurnIndex ?? 0; const dice = ps?.lastDice;
    const lastEvent = ps?.lastEvent || null; const n = turnOrder.length;
    const moverId = n > 0 ? turnOrder[(curIdx - 1 + n) % n] : null;
    let totalMs = 0; let overshoot = false; const boardSize = 400;
    Object.entries(positions).forEach(([uid, pos]: [string, any]) => {
      const newSq = pos > 0 ? pos : 1; const prevServer = lastSquaresRef.current[uid] ?? (pos > 0 ? pos : 1);
      const prevVisual = prevServer > 0 ? prevServer : 1;
      if (uid === moverId && dice != null && dice > 0) {
        const serverPrev = prevServer > 0 ? prevServer : 0; const landing = serverPrev + dice;
        if (lastEvent === "snake" && SNAKES[landing] !== undefined) {
          const pts = tilePoints(prevVisual, landing, boardSize).concat(snakePathPoints(landing, SNAKES[landing], boardSize));
          if (pts.length > 0) { runTokenPath(uid, pts); totalMs = Math.max(totalMs, pts.reduce((a, p) => a + p.ms, 0)); }
        } else if (lastEvent === "ladder" && LADDERS[landing] !== undefined) {
          const pts = tilePoints(prevVisual, landing, boardSize).concat(ladderPathPoints(landing, LADDERS[landing], boardSize));
          if (pts.length > 0) { runTokenPath(uid, pts); totalMs = Math.max(totalMs, pts.reduce((a, p) => a + p.ms, 0)); }
        } else if (landing > 100) { overshoot = reason !== "turn_timeout"; }
        else { const pts = tilePoints(prevVisual, newSq, boardSize); if (pts.length > 0) { runTokenPath(uid, pts); totalMs = Math.max(totalMs, pts.reduce((a, p) => a + p.ms, 0)); } }
      } else if (newSq !== prevVisual) { const pts = tilePoints(prevVisual, newSq, boardSize); if (pts.length > 0) { runTokenPath(uid, pts); totalMs = Math.max(totalMs, pts.reduce((a, p) => a + p.ms, 0)); } }
    });
    Object.entries(positions).forEach(([uid, pos]: [string, any]) => { lastSquaresRef.current[uid] = pos; });
    return { totalMs, moverId, overshoot, lastEvent };
  }, [runTokenPath]);

  const applySync = useCallback((ps: any, reason?: string) => {
    const { totalMs, moverId, overshoot, lastEvent } = applyStateDelta(ps, reason);
    if (moverId && moverId !== userId && ps.lastDice != null && ps.lastDice > 0) {
      setRemoteRolling(moverId);
      if (remoteRollTimer.current) clearTimeout(remoteRollTimer.current);
      remoteRollTimer.current = setTimeout(() => setRemoteRolling(null), Math.min(DICE_ROLL_MS + 200, Math.max(1800, totalMs)));
    }
    if (lastEvent === "snake" && moverId) showToastFn(`🐍 ${pName(moverId)} got eaten — slid down to ${ps.positions[moverId]}!`);
    else if (lastEvent === "ladder" && moverId) showToastFn(`🪜 ${pName(moverId)} climbed the ladder to ${ps.positions[moverId]}!`);
    else if (overshoot) showToastFn("😅 Too far! You need the exact roll to finish.");
    const autoRolledByMe = autoRolledRef.current === moverId;
    if (autoRolledByMe) autoRolledRef.current = null;
    if (reason === "turn_timeout" && moverId && !autoRolledByMe) showToastFn(`⏰ ${pName(moverId)} was idle — auto-rolled!`);
    if (moverId && ps.positions) {
      const landed = ps.positions[moverId] > 0 ? ps.positions[moverId] : null;
      if (landed) { setLastLanded(landed); if (landedTimer.current) clearTimeout(landedTimer.current); landedTimer.current = setTimeout(() => setLastLanded((cur) => (cur === landed ? null : cur)), Math.min(4000, totalMs + 1600)); }
    }
    setState(ps); setRolling(false); setLastDice(ps.lastDice ?? null);
    const nowMyTurn = (ps.turnOrder || []).indexOf(userId) === ps.currentTurnIndex;
    if (nowMyTurn && remoteRollTimer.current) { clearTimeout(remoteRollTimer.current); setRemoteRolling(null); }
    setIsMyTurn(nowMyTurn);
    return totalMs;
  }, [applyStateDelta, pName, showToastFn, userId]);

  // Sync queue
  const applySyncRef = useRef(applySync); applySyncRef.current = applySync;
  const syncQueueRef = useRef<Array<{ ps: any; reason?: string }>>([]);
  const processingSyncRef = useRef(false);
  const drainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matchEndedRef = useRef(false);

  const drainSyncQueue = useCallback(() => {
    if (processingSyncRef.current || matchEndedRef.current) return;
    const next = syncQueueRef.current.shift(); if (!next) return;
    processingSyncRef.current = true;
    const totalMs = applySyncRef.current(next.ps, next.reason) || 0;
    const settle = Math.max(700, Math.min(3200, totalMs + 650));
    drainTimerRef.current = setTimeout(() => { drainTimerRef.current = null; processingSyncRef.current = false; drainSyncQueue(); }, settle);
  }, []);

  const enqueueSync = useCallback((ps: any, reason?: string) => { syncQueueRef.current.push({ ps, reason }); drainSyncQueue(); }, [drainSyncQueue]);
  const enqueueSyncRef = useRef(enqueueSync); enqueueSyncRef.current = enqueueSync;

  // ── Shared socket hook ─────────────────────────────────────────────
  const { socket, status: hookStatus } = useGameSocket({
    matchId, userId, wsToken, externalPhase, onComplete,
    onConnectAck: (data) => {
      const enginePlayers = extractEnginePlayers(data);
      setPlayerInfo(buildPlayerInfo(enginePlayers));
      const ps = data.state?.pluginState;
      if (ps) {
        if (ps.positions) Object.entries(ps.positions).forEach(([uid, pos]: [string, any]) => { lastSquaresRef.current[uid] = pos; });
        setState(ps); setIsMyTurn((ps.turnOrder || []).indexOf(userId) === ps.currentTurnIndex);
      }
      return {};
    },
    onStart: (data) => {
      const startPlayers = extractEnginePlayers(data);
      if (startPlayers.length) setPlayerInfo(buildPlayerInfo(startPlayers));
      const ps = data.state?.pluginState ?? data.state;
      if (ps) {
        if (ps.positions) Object.entries(ps.positions).forEach(([uid, pos]: [string, any]) => { lastSquaresRef.current[uid] = pos; });
        setState(ps); setIsMyTurn((ps.turnOrder || []).indexOf(userId) === ps.currentTurnIndex);
      }
    },
    onSync: () => { /* handled by raw SYNC listener below for sync queue */ },
    onChat: (data) => {
      const text = String(data?.text || "").trim(); if (!text) return;
      const uid = String(data?.userId || "");
      const order = stateRef.current?.turnOrder || [];
      const idx = order.indexOf(uid);
      const color = PLAYER_COLORS[(idx >= 0 ? idx : 0) % PLAYER_COLORS.length];
      const name = data?.name || (uid === userId ? myName : `Player ${idx + 1}`) || "Player";
      const id = Date.now() + Math.random();
      setChatPopups((p) => [...p.slice(-3), { id, uid, name, text, color, cornerIdx: idx >= 0 ? idx : 0 }]);
      setTimeout(() => { setChatPopups((p) => p.filter((pp) => pp.id !== id)); }, 4000);
      
      if (uid !== userId) {
        require("react-native").DeviceEventEmitter.emit("GAME_ENGINE_CHAT", { name, text });
      }
    },
  });

  // Sync status
  useEffect(() => {
    if (hookStatus === "active" || hookStatus === "waiting") setStatus(hookStatus);
    else if (hookStatus === "finished") setStatus("finished");
  }, [hookStatus]);

  // Raw SYNC + GAME_OVER + ERROR listeners (for sync queue + game-specific handling)
  useEffect(() => {
    if (!socket) return;
    const handleSyncRaw = (data: any) => {
      if (!data.state) return;
      if (rollingRef.current) { pendingSyncRef.current = { ps: data.state, reason: data.reason }; return; }
      enqueueSyncRef.current(data.state, data.reason);
    };
    const handleGameOver = (data: any) => {
      matchEndedRef.current = true; syncQueueRef.current = [];
      processingSyncRef.current = false;
      if (drainTimerRef.current) { clearTimeout(drainTimerRef.current); drainTimerRef.current = null; }
      const full = data.state || {}; const ps = full.pluginState || {};
      const winner = data.winner || ps.winner || null; const won = winner === userId;
      const { totalMs } = applyStateDelta(ps);
      if (ps.positions) setState(ps); setStatus("finished");
      setRolling(false); setRemoteRolling(null); setDicePreview(null); setLastDice(ps.lastDice ?? null);
      if (won) gameSound.playWin(); else gameSound.playLoss();
      showToastFn(won ? "🏆 You reached 100 — You Win!" : "🏁 Game Over");
      const delay = Math.min(7000, totalMs + 2400);
      setTimeout(() => { onCompleteRef.current({ score: won ? 1 : 0, won, xpEarned: won ? 60 : 10, durationSeconds: 0 }); }, delay);
    };
    const handleError = (e: any) => showToastFn("⚠️ " + (e.message || "Error"));

    socket.on("SYNC", handleSyncRaw);
    socket.on("GAME_OVER", handleGameOver);
    socket.on("ERROR", handleError);
    return () => {
      if (landedTimer.current) clearTimeout(landedTimer.current);
      if (remoteRollTimer.current) clearTimeout(remoteRollTimer.current);
      if (drainTimerRef.current) clearTimeout(drainTimerRef.current);
      matchEndedRef.current = true; syncQueueRef.current = [];
      socket.off("SYNC", handleSyncRaw);
      socket.off("GAME_OVER", handleGameOver);
      socket.off("ERROR", handleError);
    };
  }, [socket, userId, applyStateDelta, showToastFn]);

  useEffect(() => { if (state) setIsMyTurn((state.turnOrder || []).indexOf(userId) === state.currentTurnIndex); }, [state, userId]);
  useTurnSound(isMyTurn, status === "active");

  useEffect(() => {
    if (isMyTurn && status === "active") {
      const loop = Animated.loop(Animated.sequence([Animated.timing(turnPulse, { toValue: 1, duration: 850, useNativeDriver: true }), Animated.timing(turnPulse, { toValue: 0, duration: 850, useNativeDriver: true })]));
      loop.start(); return () => loop.stop();
    }
    turnPulse.setValue(0);
  }, [isMyTurn, status]);

  useEffect(() => { if (!rolling && !remoteRolling) return; const id = setInterval(() => setDicePreview(1 + Math.floor(Math.random() * 6)), 110); return () => clearInterval(id); }, [rolling, remoteRolling]);

  useEffect(() => {
    if (status !== "active" || !state) return;
    const key = `${state.currentTurnIndex ?? 0}:${(state.turnOrder || []).join(",")}`;
    if (key !== lastTurnKeyRef.current) { lastTurnKeyRef.current = key; turnStartRef.current = Date.now(); lastCountRef.current = -1; autoRollFiredRef.current = false; setAutoRoll(null); }
  }, [state, status]);

  const rollDice = useCallback((): boolean => {
    if (!isMyTurn || rolling) return false;
    setRolling(true); rollingRef.current = true;
    socket?.emit(GAME_EVENTS.MOVE, { type: "ROLL" });
    gameSound.playTap(); diceRotate.setValue(0);
    Animated.sequence([
      Animated.parallel([Animated.spring(diceAnim, { toValue: 1.35, useNativeDriver: true, speed: 60 }), Animated.timing(diceRotate, { toValue: 1, duration: 160, useNativeDriver: true })]),
      Animated.parallel([Animated.spring(diceAnim, { toValue: 0.82, useNativeDriver: true, speed: 40 }), Animated.timing(diceRotate, { toValue: -0.6, duration: 160, useNativeDriver: true })]),
      Animated.parallel([Animated.spring(diceAnim, { toValue: 1.18, useNativeDriver: true, speed: 40 }), Animated.timing(diceRotate, { toValue: 1, duration: 160, useNativeDriver: true })]),
      Animated.parallel([Animated.spring(diceAnim, { toValue: 0.9, useNativeDriver: true, speed: 30 }), Animated.timing(diceRotate, { toValue: -0.35, duration: 160, useNativeDriver: true })]),
      Animated.parallel([Animated.spring(diceAnim, { toValue: 1, useNativeDriver: true, speed: 20 }), Animated.timing(diceRotate, { toValue: 0, duration: 180, useNativeDriver: true })]),
      Animated.delay(Math.max(0, DICE_ROLL_MS - 950)),
    ]).start(() => { rollingRef.current = false; setRolling(false); const pend = pendingSyncRef.current; if (pend) { pendingSyncRef.current = null; applySync(pend.ps, pend.reason); } });
    return true;
  }, [isMyTurn, socket, rolling, applySync, diceAnim, diceRotate]);

  useEffect(() => {
    if (status !== "active" || !state || !socket) return;
    const id = setInterval(() => {
      if (rolling) return;
      const order = state.turnOrder || []; const curUid = order[state.currentTurnIndex ?? 0];
      if (!curUid) return; const idle = Date.now() - turnStartRef.current;
      if (idle < AUTO_GRACE_MS) { setAutoRoll(null); return; }
      if (idle < AUTO_ROLL_MS) {
        const remaining = Math.max(1, Math.ceil((AUTO_ROLL_MS - idle) / 1000));
        if (lastCountRef.current !== remaining) { lastCountRef.current = remaining; gameSound.playTick(); }
        setAutoRoll({ remaining, target: curUid, phase: "countdown" });
      } else if (curUid === userId && !autoRollFiredRef.current) {
        autoRollFiredRef.current = true;
        if (rollDice()) { autoRolledRef.current = curUid; showToastFn("⏰ You were idle — auto-rolling for you!"); }
        setAutoRoll({ remaining: 0, target: curUid, phase: "rolling" });
      } else { setAutoRoll({ remaining: 0, target: curUid, phase: "rolling" }); }
    }, 250);
    return () => clearInterval(id);
  }, [status, state, socket, rolling, userId, rollDice, showToastFn]);

  useEffect(() => {
    const sub = require("react-native").DeviceEventEmitter.addListener("GAME_PANEL_OUTGOING_CHAT", (text: string) => {
      socket?.emit(GAME_EVENTS.CHAT, { text });
    });
    return () => sub.remove();
  }, [socket]);
  const kbLift = kbH; // Both platforms overlay keyboard inside a Modal

  return (
    <SnakeLadderGame
      matchId={matchId} userId={userId} players={players} myName={myName} myAvatar={myAvatar}
      onComplete={onComplete} status={status} state={state} isMyTurn={isMyTurn}
      toast={toast} rolling={rolling} remoteRolling={remoteRolling} lastDice={lastDice}
      dicePreview={dicePreview} lastLanded={lastLanded} playerInfo={playerInfo}
      autoRoll={autoRoll} chatPopups={chatPopups}
      kbH={kbH} kbLift={kbLift} tokenAnims={tokenAnims}
      getOrCreateTokenAnim={getOrCreateTokenAnim} diceRotate={diceRotate}
      diceAnim={diceAnim} toastAnim={toastAnim} turnPulse={turnPulse}
      rollDice={rollDice} showToast={showToastFn}
    />
  );
}
