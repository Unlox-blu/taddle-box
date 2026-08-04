import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  Image, Dimensions, Easing, Modal, ScrollView, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, {
  Line, Circle, Path, Defs, LinearGradient as SvgGrad, Stop, G, Ellipse, Polygon, Text as SvgText,
} from 'react-native-svg';
import type { HtmlGameResult } from '../../games/types';
import { createGameEngineSocket } from '../../services/socketClient';
import { gameSound, useTurnSound } from '../../services/gameSound';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
// Board must fit under: in-game top bar + player cards + controls (+ the host's
// modal header) so it never clips on short screens.
const BOARD_SIZE = Math.min(Math.floor(SCREEN_W - 24), 400, Math.floor(SCREEN_H - 340));
const GRID = 10;
const CELL = BOARD_SIZE / GRID;

// ── Board data ─────────────────────────────────────────────────────────────
// Layout mirrors the reference board image exactly.
// Snakes: head -> tail | Ladders: base -> top
const SNAKES: Record<number, number> = {
  99: 80, 95: 75, 92: 88, 89: 58, 74: 53,
  62: 19, 64: 60, 46: 25, 49: 11, 16: 6,
};
const LADDERS: Record<number, number> = {
  87: 94, 78: 98, 71: 91, 51: 67, 36: 44,
  21: 42, 28: 84, 15: 26, 2: 38, 7: 14, 8: 31,
};
const SNAKE_KEYS = Object.keys(SNAKES).map(Number);

// Reference-style dark cells: navy board, maroon snake heads, teal ladder bases
const CELL_A = '#23205C';   // dark navy
const CELL_B = '#1C194E';   // darker navy
const SNAKE_CELL = '#8A2433'; // maroon
const LADDER_CELL = '#0F6E63'; // teal

const PLAYER_COLORS = ['#EF4444', '#3B82F6', '#22C55E', '#EAB308'];
const PLAYER_DARK = ['#B91C1C', '#1D4ED8', '#15803D', '#A16207'];

// Per-snake palette (head + body + pattern) in the reference board's colors
const SNAKE_STYLES = [
  { body: '#F97316', head: '#DC2626', dark: '#9A3412', pattern: '#7C2D12' }, // red-orange
  { body: '#3B82F6', head: '#1D4ED8', dark: '#1E3A8A', pattern: '#1E3A8A' }, // blue
  { body: '#22C55E', head: '#16A34A', dark: '#166534', pattern: '#166534' }, // green
  { body: '#A855F7', head: '#7E22CE', dark: '#6B21A8', pattern: '#6B21A8' }, // purple
  { body: '#FACC15', head: '#F59E0B', dark: '#B45309', pattern: '#B45309' }, // yellow-orange
  { body: '#06B6D4', head: '#0891B2', dark: '#155E75', pattern: '#155E75' }, // cyan
];

const TILE_MS = 300;          // ms per single-square step (slow, readable)
const TILE_LONG_MS = 190;     // ms per step on a long run (14+ squares)
const SNAKE_RIDE_MS = 58;     // ms per sample along the snake body
const LADDER_MS = 105;        // ms per sample along the ladder

// Dice: ~2s roll animation before the result settles.
const DICE_ROLL_MS = 2000;    // total roll duration
const DICE_FLICKER_MS = 110;  // flicker interval while rolling

// Idle auto-roll: 5s grace, then a 5s "auto-roll in Xs" countdown, then roll.
const AUTO_GRACE_MS = 5000;
const AUTO_COUNTDOWN_MS = 5000;
const AUTO_ROLL_MS = AUTO_GRACE_MS + AUTO_COUNTDOWN_MS;

type Pt = { x: number; y: number };
type PathPt = { x: number; y: number; ms: number };

// Convert square (1-100) to pixel center {x, y}
function squareToCenter(sq: number): Pt {
  const idx = sq - 1;
  const rawRow = Math.floor(idx / GRID);
  const rawCol = idx % GRID;
  const row = GRID - 1 - rawRow;
  const col = rawRow % 2 === 0 ? rawCol : GRID - 1 - rawCol;
  return {
    x: col * CELL + CELL / 2,
    y: row * CELL + CELL / 2,
  };
}

// ── Cubic bezier helpers (mirror the SVG snake body) ───────────────────────
function bezierPoint(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function bezierTangent(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const mt = 1 - t;
  return {
    x: 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
}

// The same control points the SVG snake body uses, so tokens ride the real
// curve. The control offset scales with the span so each snake bows cleanly
// away from its neighbours (no overlaps — verified against the layout math).
function snakeCurve(headSq: number, tailSq: number, idx: number) {
  const s = squareToCenter(headSq);
  const e = squareToCenter(tailSq);
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const mag = Math.min(46, Math.max(18, dist * 0.35));
  const off = mag * (idx % 2 === 0 ? 1 : -1);
  const mx = (s.x + e.x) / 2;
  const my = (s.y + e.y) / 2;
  const p1 = { x: mx + off, y: my - mag * 0.3 };
  const p2 = { x: mx - off, y: my + mag * 0.3 };
  return { s, e, p1, p2, d: `M ${s.x} ${s.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${e.x} ${e.y}` };
}

function snakeIndexOf(sq: number): number {
  const i = SNAKE_KEYS.indexOf(sq);
  return i < 0 ? 0 : i;
}

// ── Dice face ──────────────────────────────────────────────────────────────
const DOT_POSITIONS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[30, 28], [70, 72]],
  3: [[30, 28], [50, 50], [70, 72]],
  4: [[30, 28], [70, 28], [30, 72], [70, 72]],
  5: [[30, 28], [70, 28], [50, 50], [30, 72], [70, 72]],
  6: [[30, 24], [70, 24], [30, 50], [70, 50], [30, 76], [70, 76]],
};

function DiceFace({ face, size }: { face: number | null; size: number }) {
  const dots = face ? DOT_POSITIONS[face] || [] : [];
  const dotR = size * 0.085;
  return (
    <View style={{
      width: size, height: size, borderRadius: size * 0.24,
      backgroundColor: '#FFFFFF',
      borderWidth: 1.5, borderColor: '#C9B8FF',
      justifyContent: 'center', alignItems: 'center',
      elevation: 4, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3,
      shadowOffset: { width: 0, height: 2 },
    }}>
      {dots.length === 0 && <Text style={{ fontSize: size * 0.42, color: '#9A93C4', fontWeight: '900' }}>?</Text>}
      {dots.map(([x, y], i) => (
        <View key={i} style={{
          position: 'absolute', left: `${x}%` as any, top: `${y}%` as any,
          width: dotR * 2, height: dotR * 2, borderRadius: dotR,
          backgroundColor: '#312E81',
          transform: [{ translateX: -dotR }, { translateY: -dotR }],
        }} />
      ))}
    </View>
  );
}

// ── Movement path builders ─────────────────────────────────────────────────
function tilePoints(from: number, to: number): PathPt[] {
  if (to <= from) return [];
  const count = to - from;
  const ms = count > 14 ? TILE_LONG_MS : TILE_MS;
  const pts: PathPt[] = [];
  for (let sq = from; sq <= to; sq++) {
    const c = squareToCenter(sq);
    pts.push({ x: c.x, y: c.y, ms });
  }
  return pts;
}

function snakePathPoints(headSq: number, tailSq: number): PathPt[] {
  const { s, e, p1, p2 } = snakeCurve(headSq, tailSq, snakeIndexOf(headSq));
  const pts: PathPt[] = [];
  const N = 28;
  for (let i = 1; i <= N; i++) {
    const t = 0.02 + (i / N) * 0.98; // start just past the head, end exactly on the tail
    const p = bezierPoint(s, p1, p2, e, t);
    pts.push({ x: p.x, y: p.y, ms: SNAKE_RIDE_MS });
  }
  return pts;
}

function ladderPathPoints(baseSq: number, topSq: number): PathPt[] {
  const s = squareToCenter(baseSq);
  const e = squareToCenter(topSq);
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dy / len;
  const uy = -dx / len;
  const rail = 5; // climb along one rail for a realistic look
  const pts: PathPt[] = [];
  const N = 9;
  for (let i = 1; i <= N; i++) {
    const t = 0.05 + (i / N) * 0.9;
    pts.push({
      x: s.x + dx * t + ux * rail,
      y: s.y + dy * t + uy * rail,
      ms: LADDER_MS,
    });
  }
  return pts;
}

const E = {
  READY: 'READY', MOVE: 'MOVE',
  CONNECT_ACK: 'CONNECT', START: 'START', SYNC: 'SYNC',
  GAME_OVER: 'GAME_OVER', ERROR: 'ERROR', CHAT: 'CHAT',
};

export type PlayerContext = {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
  team?: number;
  seat?: number;
};

type Props = {
  matchId: string;
  userId: string;
  wsToken: string;
  players?: PlayerContext[];
  myName?: string;
  myAvatar?: string | null;
  onComplete: (result: HtmlGameResult) => void;
};

/**
 * Pull the richest player-snapshot list out of the engine payload. The engine
 * stores the lobby snapshots (which carry displayName + avatar) nested under
 * metadata.matchMetadata.playerSnapshots — the flat metadata.players /
 * state.players fallbacks only hold { userId, color }.
 */
function extractEnginePlayers(data: any): any[] {
  const md = data?.state?.metadata || {};
  const nested = md.matchMetadata || {};
  return (
    nested.playerSnapshots ||
    md.playerSnapshots ||
    nested.players ||
    md.players ||
    data?.state?.players ||
    []
  );
}

function buildPlayerInfo(players: any[]): Record<string, { name: string; username?: string; avatar?: string }> {
  const info: Record<string, { name: string; username?: string; avatar?: string }> = {};
  players.forEach((p: any) => {
    const uid = p.id || p.userId;
    if (uid) {
      info[uid] = {
        name: p.displayName || p.name || p.username || 'Player',
        username: p.username,
        avatar: p.avatar || p.avatarUrl,
      };
    }
  });
  return info;
}

type ChatMsg = { id: number; uid?: string; name: string; color: string; text: string; time: string };

export default function SnakeLadderGame({ matchId, userId, wsToken, players, myName, myAvatar, onComplete }: Props) {
  const [socket, setSocket] = useState<any>(null);
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'active' | 'finished'>('connecting');
  const [state, setState] = useState<any>(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  // Remote dice: while another player is mid-roll we flicker the shared dice so
  // their roll is visible to everyone, not just the roller.
  const [remoteRolling, setRemoteRolling] = useState<string | null>(null);
  const [lastDice, setLastDice] = useState<number | null>(null);
  const [dicePreview, setDicePreview] = useState<number | null>(null);
  const [lastLanded, setLastLanded] = useState<number | null>(null);
  const [playerInfo, setPlayerInfo] = useState<Record<string, { name: string; username?: string; avatar?: string }>>({});
  const [autoRoll, setAutoRoll] = useState<null | { remaining: number; target: string; phase: 'countdown' | 'rolling' }>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPopups, setChatPopups] = useState<Array<{ id: number; uid: string; name: string; text: string; color: string }>>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');

  // Refs mirror volatile props so the socket effect stays mounted
  const playersRef = useRef(players);
  playersRef.current = players;
  const playerInfoRef = useRef(playerInfo);
  playerInfoRef.current = playerInfo;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const landedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const diceAnim = useRef(new Animated.Value(1)).current;
  const diceRotate = useRef(new Animated.Value(0)).current;
  const toastAnim = useRef(new Animated.Value(0)).current;
  const turnPulse = useRef(new Animated.Value(0)).current;
  const remoteRollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-roll bookkeeping
  const turnStartRef = useRef(0);
  const lastTurnKeyRef = useRef('');
  const lastCountRef = useRef(-1);
  const autoRolledRef = useRef<string | null>(null);
  const autoRollFiredRef = useRef(false);

  // Chat bookkeeping
  const chatScroll = useRef<ScrollView>(null);
  const msgIdRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Dice-roll buffering bookkeeping
  const rollingRef = useRef(false);
  const pendingSyncRef = useRef<{ ps: any; reason?: string } | null>(null);

  // Per-player animated positions
  const tokenAnims = useRef<Record<string, { x: Animated.Value; y: Animated.Value }>>({}).current;
  const lastSquaresRef = useRef<Record<string, number>>({});
  const animatingRef = useRef<Set<string>>(new Set());

  const getOrCreateTokenAnim = useCallback((uid: string, sq: number) => {
    if (!tokenAnims[uid]) {
      const c = squareToCenter(Math.max(1, sq));
      tokenAnims[uid] = {
        x: new Animated.Value(c.x),
        y: new Animated.Value(c.y),
      };
    }
    return tokenAnims[uid];
  }, [tokenAnims]);

  // Move a token through an ordered list of points, one animation step per point
  const runTokenPath = useCallback((uid: string, pts: PathPt[]) => {
    const anim = tokenAnims[uid];
    if (!anim || pts.length < 2) return;
    if (animatingRef.current.has(uid)) return; // never interrupt an in-flight ride
    animatingRef.current.add(uid);
    const steps = pts.slice(1).map(p =>
      Animated.parallel([
        Animated.timing(anim.x, { toValue: p.x, duration: p.ms, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(anim.y, { toValue: p.y, duration: p.ms, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ]),
    );
    Animated.sequence(steps).start(() => animatingRef.current.delete(uid));
  }, [tokenAnims]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(2300),
      Animated.timing(toastAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [toastAnim]);

  /**
   * Compare the freshly synced plugin state against what we knew, and drive the
   * tokens: normal moves step tile-by-tile, snake bites ride down the snake body,
   * ladder landings climb the rails. Returns timing info for the caller.
   */
  const applyStateDelta = useCallback((ps: any, reason?: string) => {
    const positions = ps?.positions || {};
    const turnOrder = ps?.turnOrder || [];
    const curIdx = ps?.currentTurnIndex ?? 0;
    const dice = ps?.lastDice;
    const lastEvent = ps?.lastEvent || null;

    const n = turnOrder.length;
    const moverId = n > 0 ? turnOrder[(curIdx - 1 + n) % n] : null;
    let totalMs = 0;
    let overshoot = false;

    const moveOne = (uid: string, pts: PathPt[]) => {
      if (pts.length > 0) {
        runTokenPath(uid, pts);
        totalMs = Math.max(totalMs, pts.reduce((a, p) => a + p.ms, 0));
      }
    };

    Object.entries(positions).forEach(([uid, pos]: [string, any]) => {
      const newSq = pos > 0 ? pos : 1;
      const prevServer = lastSquaresRef.current[uid] ?? (pos > 0 ? pos : 1);
      const prevVisual = prevServer > 0 ? prevServer : 1;

      if (uid === moverId && dice != null && dice > 0) {
        const serverPrev = prevServer > 0 ? prevServer : 0;
        const landing = serverPrev + dice;
        if (lastEvent === 'snake' && SNAKES[landing] !== undefined) {
          // Tile by tile to the head, then a smooth glide down the body to the tail
          moveOne(uid, tilePoints(prevVisual, landing).concat(snakePathPoints(landing, SNAKES[landing])));
        } else if (lastEvent === 'ladder' && LADDERS[landing] !== undefined) {
          // Tile by tile to the base, then climb the rails to the top
          moveOne(uid, tilePoints(prevVisual, landing).concat(ladderPathPoints(landing, LADDERS[landing])));
        } else if (landing > 100) {
          overshoot = reason !== 'turn_timeout';
        } else {
          moveOne(uid, tilePoints(prevVisual, newSq));
        }
      } else if (newSq !== prevVisual) {
        moveOne(uid, tilePoints(prevVisual, newSq));
      }
    });

    // Persist the new squares for the next delta
    Object.entries(positions).forEach(([uid, pos]: [string, any]) => {
      lastSquaresRef.current[uid] = pos;
    });

    return { totalMs, moverId, overshoot, lastEvent };
  }, [runTokenPath]);

  const pName = useCallback((uid: string): string => {
    const p = playersRef.current?.find(x => x.id === uid) || playerInfoRef.current[uid];
    return uid === userId ? 'You' : p?.name || p?.username || 'Player';
  }, [userId]);

  /**
   * Apply a freshly synced plugin state (dice result + token movement).
   * Extracted so a ~2s dice-roll animation can buffer the incoming sync and
   * only settle on the result after the tumble finishes.
   */
  const applySync = useCallback((ps: any, reason?: string) => {
    const { totalMs, moverId, overshoot, lastEvent } = applyStateDelta(ps, reason);

    // Surface other players' rolls on the shared dice: flicker for a moment,
    // then settle on the actual result once their move animation finishes.
    if (moverId && moverId !== userId && ps.lastDice != null && ps.lastDice > 0) {
      setRemoteRolling(moverId);
      if (remoteRollTimer.current) clearTimeout(remoteRollTimer.current);
      const flickerMs = Math.min(DICE_ROLL_MS + 200, Math.max(1800, totalMs));
      remoteRollTimer.current = setTimeout(() => setRemoteRolling(null), flickerMs);
    }

    if (lastEvent === 'snake' && moverId) {
      showToast(`🐍 ${pName(moverId)} got eaten — slid down to ${ps.positions[moverId]}!`);
      gameSound.playError();
    } else if (lastEvent === 'ladder' && moverId) {
      showToast(`🪜 ${pName(moverId)} climbed the ladder to ${ps.positions[moverId]}!`);
      gameSound.playCorrect();
    } else if (overshoot) {
      showToast('😅 Too far! You need the exact roll to finish.');
      gameSound.playTap();
    }

    // Server auto-roll (idle player) feedback
    const autoRolledByMe = autoRolledRef.current === moverId;
    if (autoRolledByMe) autoRolledRef.current = null;
    if (reason === 'turn_timeout' && moverId && !autoRolledByMe) {
      showToast(`⏰ ${pName(moverId)} was idle — auto-rolled!`);
      gameSound.playTick();
    }

    if (moverId && ps.positions) {
      const landed = ps.positions[moverId] > 0 ? ps.positions[moverId] : null;
      if (landed) {
        setLastLanded(landed);
        if (landedTimer.current) clearTimeout(landedTimer.current);
        landedTimer.current = setTimeout(() => setLastLanded(cur => (cur === landed ? null : cur)), Math.min(4000, totalMs + 1600));
      }
    }

    setState(ps);
    setRolling(false);
    setLastDice(ps.lastDice ?? null);
    const nowMyTurn = (ps.turnOrder || []).indexOf(userId) === ps.currentTurnIndex;
    if (nowMyTurn && remoteRollTimer.current) {
      // A remote player's roll just ended on my turn — stop their flicker now.
      clearTimeout(remoteRollTimer.current);
      setRemoteRolling(null);
    }
    setIsMyTurn(nowMyTurn);
  }, [applyStateDelta, pName, showToast, userId]);

  useEffect(() => {
    const s = createGameEngineSocket(matchId, userId, wsToken);
    setSocket(s);

    s.on(E.CONNECT_ACK, (data: any) => {
      const players = extractEnginePlayers(data);
      const info = buildPlayerInfo(players);
      setPlayerInfo(info);

      const ps = data.state?.pluginState;
      if (ps) {
        if (ps.positions) {
          Object.entries(ps.positions).forEach(([uid, pos]: [string, any]) => {
            lastSquaresRef.current[uid] = pos;
          });
        }
        setState(ps);
        setIsMyTurn((ps.turnOrder || []).indexOf(userId) === ps.currentTurnIndex);
      }
      setStatus(data.state?.status === 'ACTIVE' ? 'active' : 'waiting');
      s.emit(E.READY);
    });

    s.on(E.START, (data: any) => {
      const startPlayers = extractEnginePlayers(data);
      if (startPlayers.length) setPlayerInfo(buildPlayerInfo(startPlayers));
      const ps = data.state?.pluginState ?? data.state;
      if (ps) {
        if (ps.positions) {
          Object.entries(ps.positions).forEach(([uid, pos]: [string, any]) => {
            lastSquaresRef.current[uid] = pos;
          });
        }
        setState(ps);
        setIsMyTurn((ps.turnOrder || []).indexOf(userId) === ps.currentTurnIndex);
      }
      setStatus('active');
    });

    s.on(E.SYNC, (data: any) => {
      if (!data.state) return;
      // While MY dice are still tumbling (~2s), buffer the result so the
      // movement only starts after the roll visually settles.
      if (rollingRef.current) {
        pendingSyncRef.current = { ps: data.state, reason: data.reason };
        return;
      }
      applySync(data.state, data.reason);
    });

    s.on(E.GAME_OVER, (data: any) => {
      const full = data.state || {};
      const ps = full.pluginState || {};
      const winner = data.winner || ps.winner || null;
      const won = winner === userId;

      // The final winning move skips SYNC — animate it from the GAME_OVER state
      const { totalMs } = applyStateDelta(ps);
      if (ps.positions) setState(ps);
      setStatus('finished');
      setRolling(false);
      setRemoteRolling(null);
      setDicePreview(null);
      setLastDice(ps.lastDice ?? null);

      if (won) gameSound.playWin(); else gameSound.playLoss();
      showToast(won ? '🏆 You reached 100 — You Win!' : '🏁 Game Over');

      const delay = Math.min(7000, totalMs + 2400);
      setTimeout(() => {
        onCompleteRef.current({ score: won ? 1 : 0, won, xpEarned: won ? 60 : 10, durationSeconds: 0 });
      }, delay);
    });

    s.on(E.ERROR, (e: any) => showToast('⚠️ ' + (e.message || 'Error')));

    // ── Real multiplayer chat (server broadcasts to the match room) ──────
    s.on(E.CHAT, (data: any) => {
      const text = String(data?.text || '').trim();
      if (!text) return;
      const uid = String(data?.userId || '');
      const order = stateRef.current?.turnOrder || [];
      const idx = order.indexOf(uid);
      const color = PLAYER_COLORS[(idx >= 0 ? idx : 0) % PLAYER_COLORS.length];
      const info = data?.name || (uid === userId ? myName : `Player ${idx + 1}`) || 'Player';
      const id = ++msgIdRef.current;
      setMessages(m => [...m, {
        id,
        uid,
        name: info,
        color,
        text,
        time: new Date(data?.ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
      // Pop the message up over the sender's profile card
      setChatPopups(p => [...p, { id, uid, name: info, color, text }]);
    });

    return () => {
      if (landedTimer.current) clearTimeout(landedTimer.current);
      if (remoteRollTimer.current) clearTimeout(remoteRollTimer.current);
      s.disconnect();
    };
  }, [matchId, userId, wsToken, applySync, pName, showToast]);

  useEffect(() => {
    if (state) setIsMyTurn((state.turnOrder || []).indexOf(userId) === state.currentTurnIndex);
  }, [state, userId]);

  // Turn-change sound + haptic when it becomes your turn
  useTurnSound(isMyTurn, status === 'active');

  // Pulse the active player card + header while it's your turn
  useEffect(() => {
    if (isMyTurn && status === 'active') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(turnPulse, { toValue: 1, duration: 850, useNativeDriver: true }),
          Animated.timing(turnPulse, { toValue: 0, duration: 850, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    turnPulse.setValue(0);
  }, [isMyTurn, status, turnPulse]);

  // Flicker dice faces while any roll is in flight (mine or another player's)
  useEffect(() => {
    if (!rolling && !remoteRolling) return;
    const id = setInterval(() => setDicePreview(1 + Math.floor(Math.random() * 6)), DICE_FLICKER_MS);
    return () => clearInterval(id);
  }, [rolling, remoteRolling]);

  // Reset the idle auto-roll clock whenever the turn changes
  useEffect(() => {
    if (status !== 'active' || !state) return;
    const key = `${state.currentTurnIndex ?? 0}:${(state.turnOrder || []).join(',')}`;
    if (key !== lastTurnKeyRef.current) {
      lastTurnKeyRef.current = key;
      turnStartRef.current = Date.now();
      lastCountRef.current = -1;
      autoRollFiredRef.current = false;
      setAutoRoll(null);
    }
  }, [state, status]);

  const rollDice = useCallback((): boolean => {
    if (!isMyTurn || rolling) return false;
    setRolling(true);
    rollingRef.current = true;
    socket?.emit(E.MOVE, { type: 'ROLL' });
    gameSound.playTap();

    // ~2s tumble: several bounces + a hold, so the result only settles after
    // the dice visibly finish rolling.
    diceRotate.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.spring(diceAnim, { toValue: 1.35, useNativeDriver: true, speed: 60 }),
        Animated.timing(diceRotate, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(diceAnim, { toValue: 0.82, useNativeDriver: true, speed: 40 }),
        Animated.timing(diceRotate, { toValue: -0.6, duration: 160, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(diceAnim, { toValue: 1.18, useNativeDriver: true, speed: 40 }),
        Animated.timing(diceRotate, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(diceAnim, { toValue: 0.9, useNativeDriver: true, speed: 30 }),
        Animated.timing(diceRotate, { toValue: -0.35, duration: 160, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(diceAnim, { toValue: 1, useNativeDriver: true, speed: 20 }),
        Animated.timing(diceRotate, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]),
      // Hold the tumble so the full ~2s elapses before the result is shown
      Animated.delay(Math.max(0, DICE_ROLL_MS - 950)),
    ]).start(() => {
      rollingRef.current = false;
      setRolling(false);
      // A sync may have arrived mid-tumble — apply it now that the dice settled
      const pend = pendingSyncRef.current;
      if (pend) {
        pendingSyncRef.current = null;
        applySync(pend.ps, pend.reason);
      }
    });
    return true;
  }, [isMyTurn, socket, rolling, applySync]);

  // Idle auto-roll: 5s grace → "auto-roll in 5s" countdown → auto-roll.
  // Own turn: emit ROLL locally. Other players: the server force-rolls on its
  // turn-timeout (12s), so we just surface "auto-rolling…" until the SYNC.
  useEffect(() => {
    if (status !== 'active' || !state || !socket) return;
    const id = setInterval(() => {
      if (rolling) return; // a roll is in flight — don't count against the player
      const order = state.turnOrder || [];
      const curUid = order[state.currentTurnIndex ?? 0];
      if (!curUid) return;
      const idle = Date.now() - turnStartRef.current;

      if (idle < AUTO_GRACE_MS) {
        setAutoRoll(null);
        return;
      }
      if (idle < AUTO_ROLL_MS) {
        const remaining = Math.max(1, Math.ceil((AUTO_ROLL_MS - idle) / 1000));
        if (lastCountRef.current !== remaining) {
          lastCountRef.current = remaining;
          gameSound.playTick();
        }
        setAutoRoll({ remaining, target: curUid, phase: 'countdown' });
      } else if (curUid === userId && !autoRollFiredRef.current) {
        autoRollFiredRef.current = true;
        // Only claim the auto-roll (and suppress the server's "idle" toast) if
        // the local emit actually fired; otherwise let the server's 12s timer
        // handle it so the player still gets accurate feedback.
        if (rollDice()) {
          autoRolledRef.current = curUid;
          showToast('⏰ You were idle — auto-rolling for you!');
        }
        setAutoRoll({ remaining: 0, target: curUid, phase: 'rolling' });
      } else {
        setAutoRoll({ remaining: 0, target: curUid, phase: 'rolling' });
      }
    }, 250);
    return () => clearInterval(id);
  }, [status, state, socket, rolling, userId, rollDice, showToast]);

  const sendChat = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    // Broadcast to the match room — the server echoes it to every player
    // (including me), and the CHAT listener below renders it for everyone.
    socket?.emit(E.CHAT, { text: t });
    setDraft('');
    gameSound.playTap();
  }, [socket]);

  // ── Board cells ──────────────────────────────────────────────────────────
  const boardCells = useMemo(() => {
    const cells = [];
    for (let sq = 1; sq <= 100; sq++) {
      const idx = sq - 1;
      const rawRow = Math.floor(idx / GRID);
      const rawCol = idx % GRID;
      const row = GRID - 1 - rawRow;
      const col = rawRow % 2 === 0 ? rawCol : GRID - 1 - rawCol;

      const isSnakeHead = SNAKES[sq] !== undefined;
      const isLadderBase = LADDERS[sq] !== undefined;
      const isLanding = lastLanded === sq;

      let bg = (row + col) % 2 === 0 ? CELL_A : CELL_B;
      let numColor = 'rgba(255,255,255,0.78)';
      if (sq === 100) bg = '#F59E0B';
      else if (isSnakeHead) { bg = SNAKE_CELL; numColor = 'rgba(255,255,255,0.9)'; }
      else if (isLadderBase) { bg = LADDER_CELL; numColor = 'rgba(255,255,255,0.9)'; }

      const dest = isSnakeHead ? SNAKES[sq] : isLadderBase ? LADDERS[sq] : null;

      cells.push(
        <View
          key={sq}
          style={{
            position: 'absolute',
            left: col * CELL,
            top: row * CELL,
            width: CELL,
            height: CELL,
            backgroundColor: bg,
            borderWidth: isLanding ? 2 : 0.5,
            borderColor: isLanding ? '#FBBF24' : 'rgba(255,255,255,0.08)',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: isLanding ? 2 : 0,
          }}
        >
          {sq === 100 ? (
            <Text style={styles.cellCrown}>👑</Text>
          ) : (
            <>
              <Text style={[styles.cellNum, { color: numColor }]}>{sq}</Text>
              {dest != null && (
                <View style={styles.cellLink}>
                  <Text style={styles.cellLinkArrow}>{isSnakeHead ? '▼' : '▲'}</Text>
                  <Text style={styles.cellLinkDest}>{dest}</Text>
                </View>
              )}
            </>
          )}
        </View>,
      );
    }
    return cells;
  }, [lastLanded]);

  // ── SVG overlays: snakes & ladders ───────────────────────────────────────
  const svgOverlays = useMemo(() => {
    const ladderElements: React.ReactElement[] = [];
    const snakeElements: React.ReactElement[] = [];

    // Ladders — wooden rails + rungs
    Object.entries(LADDERS).forEach(([startStr, end]) => {
      const start = Number(startStr);
      const s = squareToCenter(start);
      const e = squareToCenter(end);
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dy / len;
      const uy = -dx / len;
      const off = 5;

      const rails = [
        { x1: s.x + ux * off, y1: s.y + uy * off, x2: e.x + ux * off, y2: e.y + uy * off },
        { x1: s.x - ux * off, y1: s.y - uy * off, x2: e.x - ux * off, y2: e.y - uy * off },
      ];
      const rungs = [];
      const count = Math.max(3, Math.floor(len / (CELL * 0.8)));
      for (let r = 1; r <= count; r++) {
        const t = r / (count + 1);
        rungs.push({
          x1: s.x + dx * t + ux * (off + 2), y1: s.y + dy * t + uy * (off + 2),
          x2: s.x + dx * t - ux * (off + 2), y2: s.y + dy * t - uy * (off + 2),
        });
      }

      ladderElements.push(
        <G key={`ladder-${start}`}>
          {rails.map((r, i) => (
            <Line key={`sh-${i}`} x1={r.x1 + 1.2} y1={r.y1 + 1.2} x2={r.x2 + 1.2} y2={r.y2 + 1.2}
              stroke="rgba(0,0,0,0.4)" strokeWidth="6" strokeLinecap="round" />
          ))}
          {rails.map((r, i) => (
            <Line key={`rail-${i}`} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2}
              stroke="url(#ladderWood)" strokeWidth="5.5" strokeLinecap="round" />
          ))}
          {rungs.map((r, i) => (
            <Line key={`rung-${i}`} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2}
              stroke="url(#ladderWood)" strokeWidth="4" strokeLinecap="round" />
          ))}
          {/* rung shine */}
          {rungs.map((r, i) => (
            <Line key={`shn-${i}`} x1={(r.x1 + r.x2) / 2} y1={(r.y1 + r.y2) / 2}
              x2={(r.x1 + r.x2) / 2 + 1.5} y2={(r.y1 + r.y2) / 2 + 1.5}
              stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" strokeLinecap="round" />
          ))}
          {/* top glow + bottom anchor */}
          <Circle cx={e.x} cy={e.y} r={5} fill="#FDE68A" opacity={0.9} />
          <Circle cx={e.x} cy={e.y} r={2.5} fill="#FFF" opacity={0.95} />
          <Circle cx={s.x} cy={s.y} r={4} fill="#D97706" opacity={0.85} />
        </G>,
      );
    });

    // Snakes — tapered body, scale pattern, prominent oriented head + tongue
    Object.entries(SNAKES).forEach(([startStr, end], idx) => {
      const start = Number(startStr);
      const { s, e, p1, p2, d } = snakeCurve(start, end, idx);

      const tan0 = bezierTangent(s, p1, p2, e, 0);
      const headDeg = Math.round(Math.atan2(tan0.y, tan0.x) * 180 / Math.PI);
      const st = SNAKE_STYLES[idx % SNAKE_STYLES.length];

      // Scale pattern samples along the body
      const samples: { x: number; y: number; a: number }[] = [];
      const NS = 12;
      for (let i = 1; i <= NS; i++) {
        const t = 0.07 + (i / NS) * 0.85;
        const p = bezierPoint(s, p1, p2, e, t);
        const tan = bezierTangent(s, p1, p2, e, t);
        samples.push({ x: p.x, y: p.y, a: Math.atan2(tan.y, tan.x) * 180 / Math.PI });
      }

      const tailPts = [1, 0.965, 0.93].map(t => bezierPoint(s, p1, p2, e, t));

      snakeElements.push(
        <G key={`snake-${start}`}>
          {/* soft drop shadow */}
          <Path d={d} stroke="rgba(0,0,0,0.35)" strokeWidth="13" fill="none"
            strokeLinecap="round" strokeLinejoin="round" transform="translate(1.5,1.5)" />
          {/* body base */}
          <Path d={d} stroke={st.body} strokeWidth="10" fill="none"
            strokeLinecap="round" strokeLinejoin="round" />
          {/* belly highlight stripe */}
          <Path d={d} stroke="rgba(255,255,255,0.35)" strokeWidth="3.5" fill="none"
            strokeLinecap="round" strokeDasharray="2,10" />
          {/* diamond scale pattern */}
          {samples.map((p, i) => {
            const r = i % 2 === 0 ? 3.2 : 2.2;
            const rad = (p.a * Math.PI) / 180;
            const pts = [0, 90, 180, 270].map(deg => {
              const a = rad + (deg * Math.PI) / 180;
              return `${(p.x + Math.cos(a) * r).toFixed(1)},${(p.y + Math.sin(a) * r).toFixed(1)}`;
            }).join(' ');
            return <Polygon key={`pat-${i}`} points={pts} fill={st.pattern} opacity={0.5} />;
          })}
          {/* tapered tail */}
          {tailPts.map((p, i) => (
            <Circle key={`tail-${i}`} cx={p.x} cy={p.y} r={4.2 - i * 1.2} fill={st.dark} />
          ))}
          {/* head — clean cartoon snake head, oriented along the body tangent */}
          <G transform={`translate(${s.x} ${s.y}) rotate(${headDeg})`}>
            {/* soft shadow under head */}
            <Ellipse cx={CELL * 0.18} cy={CELL * 0.04} rx={CELL * 0.4} ry={CELL * 0.3} fill="rgba(0,0,0,0.28)" />
            {/* head base — round, slightly wider than the body */}
            <Ellipse cx={CELL * 0.16} cy={0} rx={CELL * 0.38} ry={CELL * 0.3} fill={st.head} />
            {/* darker outline for pop */}
            <Ellipse cx={CELL * 0.16} cy={0} rx={CELL * 0.38} ry={CELL * 0.3} fill="none" stroke={st.dark} strokeWidth={2} />
            {/* crown highlight */}
            <Ellipse cx={CELL * 0.13} cy={-CELL * 0.12} rx={CELL * 0.24} ry={CELL * 0.1} fill="rgba(255,255,255,0.28)" />
            {/* lighter jaw underside */}
            <Ellipse cx={CELL * 0.15} cy={CELL * 0.15} rx={CELL * 0.24} ry={CELL * 0.11} fill="rgba(255,255,255,0.22)" />
            {/* neck collar behind the jaw */}
            <Path
              d={`M ${-CELL * 0.14} ${-CELL * 0.22} Q ${CELL * 0.02} ${-CELL * 0.38} ${CELL * 0.2} ${-CELL * 0.26}`}
              stroke={st.dark} strokeWidth={CELL * 0.12} fill="none" strokeLinecap="round" opacity={0.7}
            />
            {/* snout */}
            <Ellipse cx={CELL * 0.44} cy={0} rx={CELL * 0.14} ry={CELL * 0.11} fill={st.head} />
            {/* eyes — big with glint */}
            <Circle cx={CELL * 0.24} cy={-CELL * 0.14} r={CELL * 0.09} fill="#FFF" />
            <Circle cx={CELL * 0.24} cy={CELL * 0.14} r={CELL * 0.09} fill="#FFF" />
            <Circle cx={CELL * 0.27} cy={-CELL * 0.14} r={CELL * 0.048} fill="#1E1B2E" />
            <Circle cx={CELL * 0.27} cy={CELL * 0.14} r={CELL * 0.048} fill="#1E1B2E" />
            <Circle cx={CELL * 0.29} cy={-CELL * 0.17} r={CELL * 0.018} fill="#FFF" />
            <Circle cx={CELL * 0.29} cy={CELL * 0.11} r={CELL * 0.018} fill="#FFF" />
            {/* nostrils */}
            <Circle cx={CELL * 0.52} cy={-CELL * 0.035} r={CELL * 0.02} fill={st.dark} />
            <Circle cx={CELL * 0.52} cy={CELL * 0.035} r={CELL * 0.02} fill={st.dark} />
            {/* forked tongue */}
            <Path
              d={`M ${CELL * 0.56} 0 C ${CELL * 0.64} ${-CELL * 0.05} ${CELL * 0.7} ${-CELL * 0.09} ${CELL * 0.76} ${-CELL * 0.15} M ${CELL * 0.56} 0 C ${CELL * 0.64} ${CELL * 0.05} ${CELL * 0.7} ${CELL * 0.09} ${CELL * 0.76} ${CELL * 0.15}`}
              stroke="#EF4444" strokeWidth={CELL * 0.055} fill="none" strokeLinecap="round" />
            {/* mouth smile */}
            <Path
              d={`M ${CELL * 0.3} ${CELL * 0.1} Q ${CELL * 0.42} ${CELL * 0.14} ${CELL * 0.5} ${CELL * 0.05}`}
              stroke={st.dark} strokeWidth={1.4} fill="none" strokeLinecap="round" opacity={0.55}
            />
          </G>
        </G>,
      );
    });

    return { ladderElements, snakeElements };
  }, []);

  // ── Player tokens (location pins with avatar) ────────────────────────────
  const TOKEN_SIZE = CELL * 0.52;
  const TOKEN_POINT = TOKEN_SIZE * 0.45;
  const TOKEN_H = TOKEN_SIZE + TOKEN_POINT * 0.4;

  const renderTokens = () => {
    if (!state?.positions) return null;
    const turnOrder = state.turnOrder || [];
    const activeIdx = state.currentTurnIndex ?? 0;

    return Object.entries(state.positions).map(([uid, pos]: [string, any], i) => {
      const sq = pos > 0 ? pos : 1;
      const anim = getOrCreateTokenAnim(uid, sq);
      const isMe = uid === userId;
      const orderIdx = turnOrder.indexOf(uid);
      const color = PLAYER_COLORS[(orderIdx >= 0 ? orderIdx : i) % PLAYER_COLORS.length];
      const info = players?.find(p => p.id === uid) || playerInfo[uid] || { name: 'Player' };
      // Profile pic: prefer the snapshot avatar; fall back to myAvatar for self
      const avatarUri = isMe ? (info.avatar || myAvatar) : info.avatar;
      const hasAvatar = !!avatarUri;
      const safeIdx = orderIdx >= 0 ? orderIdx : i;
      const isActive = activeIdx === orderIdx;
      const spreadX = (safeIdx % 2) * 8 - 4;
      const spreadY = Math.floor(safeIdx / 2) * 8 - 4 + (sq >= 91 ? 6 : 0); // keep row-1 pins inside the board

      return (
        <Animated.View
          key={`tok-${uid}`}
          style={{
            position: 'absolute',
            width: TOKEN_SIZE,
            height: TOKEN_H,
            left: Animated.subtract(anim.x, TOKEN_SIZE / 2),
            top: Animated.subtract(anim.y, TOKEN_H),
            zIndex: isActive ? 40 : isMe ? 30 : 10 + i,
          }}
        >
          <View style={{ transform: [{ translateX: spreadX }, { translateY: spreadY }] }}>
            {/* avatar circle */}
            <View style={{
              width: TOKEN_SIZE, height: TOKEN_SIZE, borderRadius: TOKEN_SIZE / 2,
              backgroundColor: color,
              borderWidth: isActive ? 2.5 : 2,
              borderColor: isActive ? '#FDE68A' : '#FFF',
              justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
              elevation: 6, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 3,
              shadowOffset: { width: 0, height: 2 },
            }}>
              {hasAvatar ? (
                <Image source={{ uri: avatarUri }} style={{ width: TOKEN_SIZE - 5, height: TOKEN_SIZE - 5, borderRadius: (TOKEN_SIZE - 5) / 2 }} />
              ) : (
                <Text style={{ fontSize: TOKEN_SIZE * 0.44, fontWeight: '900', color: '#FFF' }}>
                  {(info.name || 'P').charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            {/* pin point */}
            <View style={{
              alignSelf: 'center',
              width: TOKEN_POINT, height: TOKEN_POINT,
              borderRadius: 3,
              backgroundColor: color,
              transform: [{ rotate: '45deg' }],
              marginTop: -TOKEN_POINT * 0.3,
              borderWidth: 1.5, borderColor: '#FFF',
            }} />
          </View>
        </Animated.View>
      );
    });
  };

  const diceFace = (rolling || !!remoteRolling) ? dicePreview : lastDice;

  // ── Derived info ──────────────────────────────────────────────────────────
  const turnOrder = state?.turnOrder || [];
  const currentTurnIdx = state?.currentTurnIndex ?? 0;
  const currentUid = turnOrder[currentTurnIdx];

  const CARD_GAP = 6;
  const CARD_W = Math.min(80, (SCREEN_W - 28 - CARD_GAP * 4) / 5);

  const pulseScale = turnPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });

  // X-center (in player-row coordinates) of a player's profile card, so chat
  // bubbles can pop up directly over the sender's card. Mirrors renderCards()
  // layout (player cards + one interleaved dice card).
  const chatCardCenterX = useCallback((uid: string): number | null => {
    const order = state?.turnOrder || [];
    const idx = order.indexOf(uid);
    if (idx < 0) return null;
    const n = order.length;
    const diceIdx = n >= 3 ? 2 : n === 2 ? 1 : 0;
    const slot = idx + (diceIdx < idx ? 1 : 0) + (diceIdx === idx ? 1 : 0);
    const totalW = (n + 1) * CARD_W + n * CARD_GAP;
    return 14 + (SCREEN_W - 28 - totalW) / 2 + slot * (CARD_W + CARD_GAP) + CARD_W / 2;
  }, [state?.turnOrder, CARD_W]);

  const renderPinCard = (uid: string, i: number) => {
    const info = players?.find(p => p.id === uid) || playerInfo[uid] || { name: 'Player' };
    const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
    const dark = PLAYER_DARK[i % PLAYER_DARK.length];
    const pos = state?.positions?.[uid] ?? 0;
    const isActive = i === currentTurnIdx;
    const isMe = uid === userId;
    const name = isMe ? (info.name || myName || 'You') : (info.name || info.username || `P${i + 1}`);
    const avatar = isMe && !info.avatar ? myAvatar : info.avatar;

    return (
      <Animated.View
        key={`card-${uid}`}
        style={[styles.pinCard, { width: CARD_W }, isActive && { transform: [{ scale: pulseScale }] }]}
      >
        <View style={[styles.pinBody, { backgroundColor: color }, isActive && styles.pinBodyActive]}>
          <View style={styles.pinAvatar}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.pinAvatarImg} />
            ) : (
              <Text style={styles.pinAvatarText}>{(name || '?').charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <Text style={styles.pinName} numberOfLines={1}>{name}</Text>
          <View style={[styles.pinScore, { backgroundColor: dark }]}>
            <Text style={styles.pinScoreText}>{pos > 0 ? pos : 0}</Text>
          </View>
          {isActive && (
            <View style={[styles.pinTurnBadge, { backgroundColor: dark }]}>
              <Text style={styles.pinTurnText}>{isMe ? 'YOUR TURN' : 'TURN'}</Text>
            </View>
          )}
        </View>
        <View style={[styles.pinPoint, { backgroundColor: color }]} />
      </Animated.View>
    );
  };

  const renderDiceCard = () => {
    const isMyTurnNow = isMyTurn;
    const text = rolling
      ? 'Rolling…'
      : remoteRolling
        ? `${pName(remoteRolling)} is rolling…`
        : isMyTurnNow
          ? 'Roll the dice'
          : currentUid
            ? `${pName(currentUid)}'s turn`
            : 'Roll the dice';
    const spin = diceRotate.interpolate({
      inputRange: [-1, 0, 1],
      outputRange: ['-15deg', '0deg', '15deg'],
    });

    return (
      <TouchableOpacity
        key="dice-card"
        style={[styles.pinCard, { width: CARD_W }]}
        activeOpacity={0.8}
        disabled={!isMyTurnNow || rolling}
        onPress={rollDice}
      >
        <View style={[styles.pinBody, styles.diceCardBody, isMyTurnNow && !rolling && styles.diceCardBodyActive]}>
          <Animated.View style={{ transform: [{ scale: diceAnim }, { rotate: spin }] }}>
            <DiceFace face={diceFace} size={CARD_W * 0.52} />
          </Animated.View>
          <Text style={styles.diceCardText} numberOfLines={2}>{text}</Text>
        </View>
        <View style={[styles.pinPoint, styles.diceCardPoint]} />
      </TouchableOpacity>
    );
  };

  const renderCards = () => {
    if (!state || turnOrder.length === 0) return null;
    const n = turnOrder.length;
    const diceIdx = n >= 3 ? 2 : n === 2 ? 1 : 0;
    const cards: React.ReactNode[] = [];
    for (let i = 0; i < n; i++) {
      if (i === diceIdx) cards.push(renderDiceCard());
      cards.push(renderPinCard(turnOrder[i], i));
    }
    if (n <= diceIdx) cards.push(renderDiceCard());
    return cards;
  };

  // Roll button label — the auto-roll countdown lives right inside the button
  const rollBtnLabel = rolling
    ? 'Rolling…'
    : autoRoll
      ? autoRoll.phase === 'countdown'
        ? `⏰ Auto-roll in ${autoRoll.remaining}s`
        : '⏰ Auto-rolling…'
      : isMyTurn
        ? 'Roll Dice'
        : 'Waiting…';

  // ── Screens ────────────────────────────────────────────────────────────────
  if (status === 'connecting') {
    return (
      <LinearGradient colors={['#150B2E', '#2E1065']} style={styles.fullCenter}>
        <LogoMark size={72} />
        <Text style={styles.splashTitle}>SNAKES & LADDERS</Text>
        <Text style={styles.splashSub}>Connecting to match…</Text>
        <LoadingDots />
      </LinearGradient>
    );
  }

  if (status === 'waiting') {
    return (
      <LinearGradient colors={['#150B2E', '#2E1065']} style={styles.fullCenter}>
        <LogoMark size={72} />
        <Text style={styles.splashTitle}>SNAKES & LADDERS</Text>
        <Text style={styles.splashSub}>Waiting for players…</Text>
        <LoadingDots />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#150B2E', '#2B1157', '#3B1D7A']} style={styles.container}>
      {/* Faint background art */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={SCREEN_W} height={SCREEN_H} style={StyleSheet.absoluteFill}>
          <Path d={`M ${-40} ${SCREEN_H * 0.85} C ${SCREEN_W * 0.3} ${SCREEN_H * 0.5} ${SCREEN_W * 0.2} ${SCREEN_H * 0.35} ${SCREEN_W * 0.8} ${SCREEN_H * 0.12}`}
            stroke="#A78BFA" strokeWidth={30} fill="none" strokeLinecap="round" opacity={0.05} />
          <Line x1={SCREEN_W * 0.02} y1={SCREEN_H * 0.2} x2={SCREEN_W * 0.1} y2={SCREEN_H * 0.02}
            stroke="#FBBF24" strokeWidth={10} strokeLinecap="round" opacity={0.05} />
        </Svg>
      </View>

      {/* Top bar: logo (tap to see How to Play) */}
      <View style={styles.topBar}>
        <View style={{ width: 34 }} />
        <TouchableOpacity style={styles.logoRow} onPress={() => setHelpOpen(true)} activeOpacity={0.7}>
          <Svg width={26} height={26}>
            <Path d="M 4 22 C 9 18 4 13 11 12 C 16 11 12 6 19 4" stroke="#22C55E" strokeWidth={4.5} fill="none" strokeLinecap="round" />
            <Circle cx={19} cy={4} r={3.4} fill="#16A34A" />
            <Circle cx={19.8} cy={2.8} r={1} fill="#FFF" />
            <Circle cx={19.8} cy={5.2} r={1} fill="#FFF" />
          </Svg>
          <Text style={styles.logoText}>
            <Text style={styles.logoSnakes}>SNAKES</Text>
            <Text style={styles.logoAmp}> & </Text>
            <Text style={styles.logoLadders}>LADDERS</Text>
          </Text>
          <Svg width={20} height={26}>
            <Line x1={5} y1={24} x2={8} y2={2} stroke="#B45309" strokeWidth={3} strokeLinecap="round" />
            <Line x1={15} y1={24} x2={12} y2={2} stroke="#B45309" strokeWidth={3} strokeLinecap="round" />
            <Line x1={6} y1={19} x2={14} y2={19} stroke="#B45309" strokeWidth={2.4} strokeLinecap="round" />
            <Line x1={6.7} y1={12} x2={13.7} y2={12} stroke="#B45309" strokeWidth={2.4} strokeLinecap="round" />
            <Line x1={7.4} y1={5} x2={13.4} y2={5} stroke="#B45309" strokeWidth={2.4} strokeLinecap="round" />
          </Svg>
        </TouchableOpacity>
        <View style={{ width: 34 }} />
      </View>

      {/* Player cards + dice */}
      <View style={styles.playerRow}>
        {renderCards()}
        {/* Chat bubbles popping up over the sender's profile card */}
        {chatPopups.map(pop => (
          <ChatBubble
            key={pop.id}
            pop={pop}
            cardCenterX={chatCardCenterX(pop.uid)}
            onDone={(id) => setChatPopups(p => p.filter(x => x.id !== id))}
          />
        ))}
      </View>

      {/* Board */}
      <View style={[styles.boardWrapper, { width: BOARD_SIZE + 16, height: BOARD_SIZE + 16 }]}>
        <LinearGradient
          colors={['rgba(124,58,237,0.55)', 'rgba(236,72,153,0.22)']}
          style={[styles.boardGlow, { width: BOARD_SIZE + 16, height: BOARD_SIZE + 16 }]}
        />
        <View style={[styles.board, { width: BOARD_SIZE, height: BOARD_SIZE }]}>
          {/* Cell backgrounds */}
          {boardCells}

          {/* SVG snakes & ladders (above cells, below tokens) */}
          <Svg
            height={BOARD_SIZE} width={BOARD_SIZE}
            style={{ position: 'absolute', top: 0, left: 0, zIndex: 3 }}
          >
            <Defs>
              <SvgGrad id="ladderWood" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#FDE68A" stopOpacity="1" />
                <Stop offset="0.5" stopColor="#D97706" stopOpacity="1" />
                <Stop offset="1" stopColor="#92400E" stopOpacity="1" />
              </SvgGrad>
            </Defs>
            {svgOverlays.ladderElements}
            {svgOverlays.snakeElements}
          </Svg>

          {/* Player tokens */}
          {renderTokens()}
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.chatBtn}
          onPress={() => setChatOpen(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="chatbubble-ellipses" size={18} color="#FFF" />
          <Text style={styles.chatBtnText}>Chat</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.rollBtn, (!isMyTurn || rolling) && styles.rollBtnDisabled]}
          onPress={rollDice}
          disabled={!isMyTurn || rolling}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={isMyTurn && !rolling ? ['#FBBF24', '#F97316'] : ['#3F3A63', '#312C54']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.rollBtnGrad}
          >
            <DiceFace face={diceFace} size={20} />
            <Text style={[styles.rollBtnText, (!isMyTurn || rolling) && { color: '#8B86B5' }]} numberOfLines={1}>
              {rollBtnLabel}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Toast notification */}
      {toast && (
        <Animated.View style={[styles.toast, {
          opacity: toastAnim,
          transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
        }]}>
          <LinearGradient colors={['#2E1065', '#4C1D95']} style={styles.toastInner}>
            <Text style={styles.toastText}>{toast}</Text>
          </LinearGradient>
        </Animated.View>
      )}

      {/* ── Match chat ───────────────────────────────────────────────────── */}
      <Modal visible={chatOpen} transparent animationType="slide" onRequestClose={() => setChatOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.chatWrap}>
          <TouchableOpacity style={styles.chatDismiss} activeOpacity={1} onPress={() => setChatOpen(false)} />
          <View style={styles.chatSheet}>
            <View style={styles.chatHeader}>
              <Text style={styles.chatTitle}>💬 Match Chat</Text>
              <View style={styles.chatLiveTag}>
                <View style={styles.chatLiveDot} />
                <Text style={styles.chatLiveText}>live</Text>
              </View>
              <TouchableOpacity onPress={() => setChatOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color="#C4B5FD" />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={chatScroll}
              style={styles.chatList}
              contentContainerStyle={styles.chatListContent}
              onContentSizeChange={() => chatScroll.current?.scrollToEnd({ animated: true })}
              keyboardShouldPersistTaps="handled"
            >
              {messages.length === 0 && (
                <Text style={styles.chatEmpty}>No messages yet — say hi! 👋</Text>
              )}
              {messages.map(m => (
                <View key={m.id} style={styles.chatMsg}>
                  <View style={styles.chatMsgMeta}>
                    <Text style={[styles.chatMsgName, { color: m.color }]}>{m.name}</Text>
                    <Text style={styles.chatMsgTime}>{m.time}</Text>
                  </View>
                  <View style={[styles.chatBubble, { borderLeftColor: m.color }]}>
                    <Text style={styles.chatMsgText}>{m.text}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.chatEmojiRow}>
              {['😀', '😂', '😎', '🔥', '🎲', '🐍', '🪜', '🏆'].map(e => (
                <TouchableOpacity key={e} onPress={() => sendChat(e)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Text style={styles.chatEmoji}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.chatInputRow}>
              <TextInput
                style={styles.chatInput}
                value={draft}
                onChangeText={setDraft}
                placeholder="Type a message…"
                placeholderTextColor="#8B84B8"
                onSubmitEditing={() => sendChat(draft)}
                returnKeyType="send"
                maxLength={140}
              />
              <TouchableOpacity
                style={[styles.chatSend, !draft.trim() && styles.chatSendDisabled]}
                onPress={() => sendChat(draft)}
                disabled={!draft.trim()}
              >
                <Ionicons name="send" size={16} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── How to play (gear) ─────────────────────────────────────────────── */}
      <Modal visible={helpOpen} transparent animationType="fade" onRequestClose={() => setHelpOpen(false)}>
        <View style={styles.helpWrap}>
          <TouchableOpacity style={styles.helpDismiss} activeOpacity={1} onPress={() => setHelpOpen(false)} />
          <View style={styles.helpCard}>
            <View style={styles.helpHeader}>
              <LogoMark size={34} />
              <Text style={styles.helpTitle}>How to Play</Text>
            </View>
            <Text style={styles.helpLine}>🐍 Climb the ladders, avoid the snakes.</Text>
            <Text style={styles.helpLine}>🎲 Roll the dice on your turn — first to square 100 wins!</Text>
            <Text style={styles.helpLine}>⏰ Idle players get auto-rolled after a 5s countdown.</Text>
            <Text style={styles.helpLine}>💬 Use the Chat button for a quick chit-chat (stays on your device).</Text>
            <TouchableOpacity style={styles.helpClose} onPress={() => setHelpOpen(false)}>
              <Text style={styles.helpCloseText}>Got it!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

// ── Logo mark (snake wrapping an S + ladder) ────────────────────────────────
function LogoMark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {/* ladder right side */}
      <Line x1={52} y1={58} x2={57} y2={6} stroke="#B45309" strokeWidth={5} strokeLinecap="round" />
      <Line x1={61} y1={58} x2={56} y2={6} stroke="#B45309" strokeWidth={5} strokeLinecap="round" />
      <Line x1={53.6} y1={44} x2={59.4} y2={44} stroke="#B45309" strokeWidth={4} strokeLinecap="round" />
      <Line x1={54.8} y1={28} x2={58.4} y2={28} stroke="#B45309" strokeWidth={4} strokeLinecap="round" />
      {/* snake wrapping the S */}
      <Path d="M 12 50 C 26 44 14 34 28 30 C 40 26 26 14 38 10" stroke="#22C55E" strokeWidth={9} fill="none" strokeLinecap="round" />
      <Circle cx={38} cy={10} r={6.5} fill="#16A34A" />
      <Circle cx={39.4} cy={7.6} r={2} fill="#FFF" />
      <Circle cx={39.4} cy={12.4} r={2} fill="#FFF" />
      <Circle cx={40.2} cy={7.2} r={0.9} fill="#1E1B2E" />
      <Circle cx={40.2} cy={12.8} r={0.9} fill="#1E1B2E" />
      {/* S letter */}
      <SvgText x={22} y={40} fontSize={30} fontWeight="900" fill="#FBBF24" textAnchor="middle">S</SvgText>
    </Svg>
  );
}

// ── Loading dots ─────────────────────────────────────────────────────────────
// ── Chat popup bubble (floats above the sender's profile card) ───────────────
function ChatBubble({ pop, cardCenterX, onDone }: {
  pop: { id: number; name: string; text: string; color: string };
  cardCenterX: number | null;
  onDone: (id: number) => void;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => onDone(pop.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (cardCenterX == null) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', top: -40, left: cardCenterX - 54, width: 108,
        opacity: anim,
        transform: [
          { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
        ],
      }}
    >
      <View style={{
        backgroundColor: pop.color, borderRadius: 10,
        paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center',
        borderWidth: 1.5, borderColor: '#FFF',
        shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 }, elevation: 9,
      }}>
        <Text style={{ color: '#FFF', fontSize: 8.5, fontWeight: '900', opacity: 0.92 }} numberOfLines={1}>
          {pop.name}
        </Text>
        <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '700' }} numberOfLines={2}>
          {pop.text}
        </Text>
      </View>
      <View style={{
        alignSelf: 'center', width: 10, height: 10, marginTop: -5,
        backgroundColor: pop.color, transform: [{ rotate: '45deg' }],
        borderRightWidth: 1.5, borderBottomWidth: 1.5, borderColor: '#FFF',
      }} />
    </Animated.View>
  );
}

function LoadingDots() {
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 24 }}>
      {[0, 1, 2].map(i => <PulseDot key={i} delay={i * 200} />)}
    </View>
  );
}

function PulseDot({ delay }: { delay: number }) {
  const anim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 400, useNativeDriver: true }),
      ]),
    ).start();
  }, []);
  return <Animated.View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#A78BFA', opacity: anim }} />;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', paddingTop: 4, paddingBottom: 10 },
  fullCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  splashTitle: { fontSize: 26, fontWeight: '900', color: '#F8FAFC', marginTop: 10, letterSpacing: 1 },
  splashSub: { fontSize: 14, color: '#A78BFA', marginTop: 6, fontWeight: '600' },

  topBar: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 14, marginTop: 2,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  logoText: { fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  logoSnakes: { color: '#FBBF24' },
  logoAmp: { color: '#C4B5FD' },
  logoLadders: { color: '#818CF8' },

  playerRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center',
    gap: 6, marginTop: 8, paddingHorizontal: 14,
  },
  pinCard: { alignItems: 'center' },
  pinBody: {
    width: '100%',
    borderRadius: 14,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    alignItems: 'center',
    paddingTop: 7, paddingBottom: 8,
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  pinBodyActive: {
    borderWidth: 2, borderColor: '#FFE9A8',
    elevation: 8, shadowOpacity: 0.5,
  },
  pinAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  pinAvatarImg: { width: 32, height: 32, borderRadius: 16 },
  pinAvatarText: { fontSize: 15, fontWeight: '900', color: '#4C1D95' },
  pinName: {
    marginTop: 3, fontSize: 9, fontWeight: '800', color: '#FFF',
    maxWidth: '92%', textAlign: 'center',
  },
  pinScore: {
    marginTop: 4, minWidth: 22, height: 15,
    borderRadius: 8, paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  pinScoreText: { fontSize: 10, fontWeight: '900', color: '#FFF' },
  pinTurnBadge: {
    position: 'absolute', top: -6, right: -6,
    paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: 7,
  },
  pinTurnText: { fontSize: 6, fontWeight: '900', color: '#FFF', letterSpacing: 0.4 },
  pinPoint: {
    width: 14, height: 14, borderRadius: 3,
    transform: [{ rotate: '45deg' }], marginTop: -7,
  },

  diceCardBody: { backgroundColor: '#6D28D9', justifyContent: 'center', paddingTop: 8 },
  diceCardBodyActive: { borderWidth: 2, borderColor: '#FDE68A' },
  diceCardText: {
    marginTop: 6, fontSize: 8.5, fontWeight: '800', color: '#FFF',
    textAlign: 'center', paddingHorizontal: 2,
  },
  diceCardPoint: { backgroundColor: '#6D28D9' },

  boardWrapper: { position: 'relative', justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  boardGlow: { position: 'absolute', borderRadius: 20, opacity: 0.85 },
  board: {
    position: 'relative', backgroundColor: '#1C194E',
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 3, borderColor: '#FBBF24',
    elevation: 18, shadowColor: '#A855F7', shadowOpacity: 0.5,
    shadowRadius: 14, shadowOffset: { width: 0, height: 5 },
  },
  cellNum: { fontSize: 10, color: 'rgba(255,255,255,0.78)', fontWeight: '800' },
  cellCrown: { fontSize: 15 },
  cellLink: { flexDirection: 'row', alignItems: 'center', gap: 1, marginTop: 1 },
  cellLinkArrow: { fontSize: 6.5, color: '#FFF', fontWeight: '900' },
  cellLinkDest: { fontSize: 6.5, color: '#FFF', fontWeight: '800', opacity: 0.95 },

  controls: {
    flexDirection: 'row', alignItems: 'center', marginTop: 12,
    gap: 10, paddingHorizontal: 14, width: '100%',
  },
  chatBtn: {
    height: 54, paddingHorizontal: 20,
    borderRadius: 27,
    backgroundColor: '#6D28D9',
    borderWidth: 1.5, borderColor: 'rgba(196,181,253,0.35)',
    flexDirection: 'row', alignItems: 'center', gap: 7,
    elevation: 6, shadowColor: '#A855F7', shadowOpacity: 0.4,
    shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  chatBtnText: { color: '#FFF', fontSize: 15, fontWeight: '900' },
  rollBtn: { flex: 1, borderRadius: 27, overflow: 'hidden', elevation: 8, shadowColor: '#F59E0B', shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
  rollBtnDisabled: { opacity: 0.55, shadowOpacity: 0 },
  rollBtnGrad: {
    height: 54, borderRadius: 27,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
  },
  rollBtnText: { color: '#431407', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },

  toast: { position: 'absolute', bottom: 86, alignSelf: 'center', borderRadius: 24, overflow: 'hidden', elevation: 16, zIndex: 90 },
  toastInner: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, borderWidth: 1.5, borderColor: 'rgba(196,181,253,0.4)' },
  toastText: { color: '#F8FAFC', fontSize: 15, fontWeight: '900' },

  // Chat
  chatWrap: { flex: 1, justifyContent: 'flex-end' },
  chatDismiss: { flex: 1 },
  chatSheet: {
    backgroundColor: '#1B0F3E',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.45)',
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 26 : 14,
    maxHeight: '72%',
  },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  chatTitle: { flex: 1, fontSize: 16, fontWeight: '900', color: '#F3F0FF' },
  chatLiveTag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9,
    backgroundColor: 'rgba(34,197,94,0.18)',
  },
  chatLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  chatLiveText: { fontSize: 9, fontWeight: '800', color: '#4ADE80', letterSpacing: 0.5 },
  chatList: { flexGrow: 0, maxHeight: 260, marginTop: 4 },
  chatListContent: { paddingBottom: 8 },
  chatEmpty: { color: '#8B84B8', fontSize: 13, textAlign: 'center', marginTop: 30, fontWeight: '600' },
  chatMsg: { marginBottom: 10 },
  chatMsgMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  chatMsgName: { fontSize: 11, fontWeight: '900' },
  chatMsgTime: { fontSize: 9, color: '#6E68A0' },
  chatBubble: {
    alignSelf: 'flex-start', maxWidth: '88%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12, borderTopLeftRadius: 4,
    borderLeftWidth: 3,
    paddingHorizontal: 11, paddingVertical: 7,
  },
  chatMsgText: { color: '#EFEBFF', fontSize: 13, lineHeight: 18 },
  chatEmojiRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 2 },
  chatEmoji: { fontSize: 20 },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  chatInput: {
    flex: 1, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1, borderColor: 'rgba(196,181,253,0.25)',
    paddingHorizontal: 16, color: '#FFF', fontSize: 14,
  },
  chatSend: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center',
  },
  chatSendDisabled: { opacity: 0.4 },

  // Help modal
  helpWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
  helpDismiss: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  helpCard: {
    width: '100%', maxWidth: 340,
    backgroundColor: '#1E1044',
    borderRadius: 22, borderWidth: 1.5, borderColor: 'rgba(124,58,237,0.5)',
    padding: 22, elevation: 14,
  },
  helpHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  helpTitle: { fontSize: 18, fontWeight: '900', color: '#F8FAFC' },
  helpLine: { color: '#D6CFF2', fontSize: 13.5, lineHeight: 21, marginBottom: 8 },
  helpClose: {
    marginTop: 14, height: 46, borderRadius: 23,
    backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center',
  },
  helpCloseText: { color: '#FFF', fontSize: 15, fontWeight: '900' },
});
