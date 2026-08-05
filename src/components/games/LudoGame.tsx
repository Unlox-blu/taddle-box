import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions, Image,
  TextInput, Modal, ScrollView, Platform, KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polygon, Circle, Defs, LinearGradient as SvgGrad, Stop, Rect } from 'react-native-svg';
import type { HtmlGameResult } from '../../games/types';
import { createGameEngineSocket } from '../../services/socketClient';
import { gameSound, useTurnSound } from '../../services/gameSound';

// Dice tumble duration — everyone (not just the roller) sees the roll.
// Slowed from 1s → ~1.6s so the bounce sequence reads as a real roll.
const DICE_ROLL_MS = 1600;

// ── Constants ─────────────────────────────────────────────────────────────────
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
// Board fills width minus margins, but leave room for corner avatars + dice
const BOARD_SIZE = Math.min(Math.floor(SCREEN_W - 88), Math.floor(SCREEN_H * 0.5), 330);
const CELL = BOARD_SIZE / 15;

// Reference-style backdrop
const BG_TOP = '#0A2472';
const BG_BOTTOM = '#050D3A';

// Corner position for each player index (matches the board quadrants)
// TL = Red(0), TR = Green(1), BR = Yellow(2), BL = Blue(3)
const CORNER_POS: Record<number, { align: 'left' | 'right'; vert: 'top' | 'bottom' }> = {
  0: { align: 'left', vert: 'top' },
  1: { align: 'right', vert: 'top' },
  2: { align: 'right', vert: 'bottom' },
  3: { align: 'left', vert: 'bottom' },
};

// Deterministic pseudo-random stars for the backdrop
function seededStars(count: number, seed = 42) {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483647; return s / 2147483647; };
  return Array.from({ length: count }, () => ({
    x: rnd() * 100, y: rnd() * 100, r: 0.8 + rnd() * 1.6, o: 0.25 + rnd() * 0.5,
  }));
}

const PLAYER_COLORS   = ['#E32636', '#009E60', '#FFC000', '#007FFF'] as const;
const PLAYER_COLORS_D = ['#9D1313', '#006B40', '#CC9900', '#0055AA'] as const;
const PLAYER_NAMES    = ['Red', 'Green', 'Yellow', 'Blue'] as const;

// ── Board path (15×15 grid) ───────────────────────────────────────────────────
const LUDO_PATH: [number, number][] = [
  [1,6],[2,6],[3,6],[4,6],[5,6],
  [6,5],[6,4],[6,3],[6,2],[6,1],[6,0],
  [7,0],[8,0],
  [8,1],[8,2],[8,3],[8,4],[8,5],
  [9,6],[10,6],[11,6],[12,6],[13,6],[14,6],
  [14,7],[14,8],
  [13,8],[12,8],[11,8],[10,8],[9,8],
  [8,9],[8,10],[8,11],[8,12],[8,13],[8,14],
  [7,14],[6,14],
  [6,13],[6,12],[6,11],[6,10],[6,9],
  [5,8],[4,8],[3,8],[2,8],[1,8],[0,8],
  [0,7],[0,6],
  [1,7],[2,7],[3,7],[4,7],[5,7],
];

// Starts + Stars
const SAFE_CELLS = new Set(['1,6','8,1','13,8','6,13', '6,2','12,6','8,12','2,8']);

// Slot positions inside each home yard (col, row)
const HOME_SLOTS: [number, number][][] = [
  [[2,2],[4,2],[2,4],[4,4]],          // Red TL
  [[11,2],[13,2],[11,4],[13,4]],      // Green TR
  [[11,11],[13,11],[11,13],[13,13]],  // Yellow BR
  [[2,11],[4,11],[2,13],[4,13]],      // Blue BL
];

const PLAYER_PATH_OFFSET = [0, 13, 26, 39];

function getTokenPos(pi: number, tokenId: number, pos: number): { x: number; y: number } {
  if (pos === -1) {
    const [col, row] = HOME_SLOTS[pi % 4][tokenId % 4];
    return { x: col * CELL, y: row * CELL };
  }
  if (pos >= 56) return { x: 7.5 * CELL, y: 7.5 * CELL };
  const idx = (PLAYER_PATH_OFFSET[pi % 4] + pos) % LUDO_PATH.length;
  const [col, row] = LUDO_PATH[idx];
  return { x: (col + 0.5) * CELL, y: (row + 0.5) * CELL };
}

// Star polygon helper
function starPts(cx: number, cy: number, r1: number, r2: number, n: number): string {
  return Array.from({ length: n * 2 }, (_, i) => {
    const a = (Math.PI / n) * i - Math.PI / 2;
    const r = i % 2 === 0 ? r1 : r2;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

const EVENTS = {
  READY: 'READY', MOVE: 'MOVE', CONNECT_ACK: 'CONNECT',
  START: 'START', SYNC: 'SYNC', GAME_OVER: 'GAME_OVER', ERROR: 'ERROR', CHAT: 'CHAT',
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
  /** Mirrors the GamePlayModal phase — the engine only STARTs once this is
      "playing" (READY is sent after the 3-2-1, never on connect). */
  externalPhase?: "playing" | "waiting";
  onComplete: (result: HtmlGameResult) => void;
};

type ChatMsg = { id: number; uid?: string; name: string; color: string; text: string; time: string };

// ── Dot positions for dice faces ──────────────────────────────────────────────
// Fixed star field for the reference-style deep-blue backdrop
const STARS = seededStars(34);

const DOT_POS: Record<number, [number, number][]> = {
  1: [[50,50]],
  2: [[28,28],[72,72]],
  3: [[28,28],[50,50],[72,72]],
  4: [[28,28],[72,28],[28,72],[72,72]],
  5: [[28,28],[72,28],[50,50],[28,72],[72,72]],
  6: [[28,20],[72,20],[28,50],[72,50],[28,80],[72,80]],
};

export default function LudoGame({
  matchId, userId, wsToken, players, myName: myNameProp, myAvatar: myAvatarProp, externalPhase = "waiting", onComplete
}: Props) {
  const [socket, setSocket] = useState<any>(null);
  
  const me = players?.find(p => p.id === userId);
  const myName = myNameProp || me?.name || 'You';
  const myAvatar = myAvatarProp || me?.avatar || null;
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'active' | 'finished'>('connecting');
  const [gameState, setGameState] = useState<any>(null);
  const [myPlayerIdx, setMyPlayerIdx] = useState(0);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Dice roll animation — visible to every player, not just the roller.
  const [rolling, setRolling] = useState(false);
  const [remoteRolling, setRemoteRolling] = useState<string | null>(null);
  const [dicePreview, setDicePreview] = useState<number | null>(null);
  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [chatPopups, setChatPopups] = useState<Array<{ id: number; uid: string; name: string; text: string; color: string; cornerIdx: number }>>([]);

  // Player info from socket (name + avatar for opponents)
  const [playerInfo, setPlayerInfo] = useState<Record<string, { name: string; avatar?: string }>>({});

  const diceScale  = useRef(new Animated.Value(1)).current;
  const diceRotate = useRef(new Animated.Value(0)).current;
  const toastAnim  = useRef(new Animated.Value(0)).current;
  // Dice-roll bookkeeping
  const rollingRef = useRef(false);
  const lastDiceRef = useRef<number | null>(null);
  const remoteRollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const msgIdRef = useRef(0);
  const chatScroll = useRef<ScrollView>(null);
  const chatInputRef = useRef<TextInput>(null);
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  // The engine fires START only after every player's board is visible — READY
  // is sent once the 3-2-1 countdown finishes, never on connect, so bot turns
  // never play out behind the countdown.
  const readySentRef = useRef(false);
  // Bumped on every CONNECT_ACK so a reconnect during the waiting phase
  // re-arms READY (the server drops the player from readyPlayers on
  // disconnect — without re-sending, the match would never start).
  const [readyTick, setReadyTick] = useState(0);

  // Per-token spring animations
  const tokenAnims = useRef<Record<string, { x: Animated.Value; y: Animated.Value }>>({}).current;

  const getAnim = useCallback((key: string, x: number, y: number) => {
    if (!tokenAnims[key]) {
      tokenAnims[key] = { x: new Animated.Value(x), y: new Animated.Value(y) };
    }
    return tokenAnims[key];
  }, []);

  const springToken = useCallback((key: string, x: number, y: number) => {
    const a = tokenAnims[key];
    if (!a) return;
    Animated.parallel([
      Animated.spring(a.x, { toValue: x, useNativeDriver: false, speed: 16, bounciness: 8 }),
      Animated.spring(a.y, { toValue: y, useNativeDriver: false, speed: 16, bounciness: 8 }),
    ]).start();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2300),
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToast(null));
  };

  useEffect(() => {
    const s = createGameEngineSocket(matchId, userId, wsToken);
    setSocket(s);

    s.on(EVENTS.CONNECT_ACK, (data: any) => {
      const ps = data.state?.pluginState;
      // Pull the rich lobby snapshots (displayName + avatar) the same way the
      // other games do — the flat players array only carries { userId, color }.
      const players: any[] = extractEnginePlayers(data);
      const idx = players.findIndex((p: any) => p.userId === userId || p.id === userId);
      setMyPlayerIdx(idx >= 0 ? idx : 0);

      // Collect player info (name / avatar)
      const info = buildPlayerInfo(players);
      // Inject self
      info[userId] = { name: myName || 'You', avatar: myAvatar || undefined };
      setPlayerInfo(info);

      // Seed dice bookkeeping so a reconnect mid-turn doesn't fake a remote roll
      if (ps?.dice != null) {
        lastDiceRef.current = ps.dice;
      }
      if (ps) setGameState(ps);
      setStatus(data.state?.status === 'ACTIVE' ? 'active' : 'waiting');
      // Reconnect (or fresh join) — re-arm the READY gate.
      readySentRef.current = false;
      setReadyTick((t) => t + 1);
    });

    s.on(EVENTS.START, (data: any) => {
      const ps = data.state?.pluginState ?? data.state;
      if (ps) setGameState(ps);
      setStatus('active');
    });

    s.on(EVENTS.SYNC, (data: any) => {
      if (!data.state) return;
      const ns = data.state;
      // Animate all tokens
      if (ns.tokens) {
        Object.entries(ns.tokens).forEach(([uid, tks]: [string, any]) => {
          const pi = ns.turnOrder?.indexOf(uid) ?? 0;
          (tks || []).forEach((t: any) => {
            const key = `${uid}-${t.id}`;
            const { x, y } = getTokenPos(pi, t.id, t.pos ?? -1);
            if (tokenAnims[key]) springToken(key, x, y);
          });
        });
      }

      // Detect a fresh roll so EVERY player sees the tumble + result.
      const newDice = ns.dice ?? null;
      if (newDice !== null && newDice !== lastDiceRef.current) {
        // Who just rolled? The current turn player is the roller.
        const order = ns.turnOrder || [];
        const rollerId = order[ns.currentTurnIndex ?? 0];
        const isRemote = rollerId && rollerId !== userId && !rollingRef.current;
        if (isRemote) {
          setRemoteRolling(rollerId);
          setDicePreview(null);
          if (remoteRollTimer.current) clearTimeout(remoteRollTimer.current);
          remoteRollTimer.current = setTimeout(() => setRemoteRolling(null), DICE_ROLL_MS);
        }
        // My own roll: rolling stays true until the tumble animation finishes,
        // so the preview keeps cycling and the result lands with the final face.
      }
      lastDiceRef.current = newDice;
      setGameState(ns);
      setIsMyTurn((ns.currentTurnIndex ?? 0) === myPlayerIdx);
    });

    s.on(EVENTS.GAME_OVER, (data: any) => {
      setStatus('finished');
      const won = (data.winner || data.state?.pluginState?.winner) === userId;
      showToast(won ? '🏆 You Won!' : '😢 You Lost');
      setTimeout(() => {
        onComplete({ score: won ? 1 : 0, won, xpEarned: won ? 60 : 10, durationSeconds: 0 });
      }, 2500);
    });

    s.on(EVENTS.ERROR, (e: any) => showToast('⚠️ ' + (e.message || 'Error')));

    // ── Real multiplayer chat ─────────────────────────────────────────────
    s.on(EVENTS.CHAT, (data: any) => {
      const text = String(data?.text || '').trim();
      if (!text) return;
      const uid = String(data?.userId || '');
      const order = gameStateRef.current?.turnOrder || [];
      const idx = order.indexOf(uid);
      const color = PLAYER_COLORS[(idx >= 0 ? idx : 0) % 4];
      const name = data?.name || (uid === userId ? myName : `Player ${idx + 1}`) || 'Player';
      const id = ++msgIdRef.current;
      setMessages(m => [...m, {
        id,
        uid,
        name,
        color,
        text,
        time: new Date(data?.ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
      // Pop the message up over the sender's corner card
      setChatPopups(p => [...p, { id, uid, name, color, text, cornerIdx: Math.max(0, idx) }]);
    });

    return () => {
      if (remoteRollTimer.current) clearTimeout(remoteRollTimer.current);
      s.disconnect();
    };
  }, [matchId, userId, wsToken]);

  // Send READY the moment the board is actually visible (after the 3-2-1).
  useEffect(() => {
    if (externalPhase !== "playing" || readySentRef.current || !socket) return;
    readySentRef.current = true;
    socket.emit(EVENTS.READY);
  }, [externalPhase, socket, readyTick]);

  useEffect(() => {
    if (gameState) setIsMyTurn((gameState.currentTurnIndex ?? 0) === myPlayerIdx);
  }, [gameState, myPlayerIdx]);

  // Turn-change sound + haptic when it becomes your turn
  useTurnSound(isMyTurn, status === 'active');

  const rollDice = useCallback(() => {
    if (!isMyTurn || gameState?.dice !== null || rolling) return;
    rollingRef.current = true;
    setRolling(true);
    socket?.emit(EVENTS.MOVE, { type: 'ROLL' });
    gameSound.playTap();

    // ~1.6s slow tumble — a series of relaxed bounces that reads as a real
    // dice roll, with the result landing via SYNC.
    diceRotate.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.spring(diceScale, { toValue: 1.4, useNativeDriver: true, speed: 28, bounciness: 14 }),
        Animated.timing(diceRotate, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(diceScale, { toValue: 0.78, useNativeDriver: true, speed: 22, bounciness: 10 }),
        Animated.timing(diceRotate, { toValue: -0.8, duration: 280, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(diceScale, { toValue: 1.22, useNativeDriver: true, speed: 18, bounciness: 10 }),
        Animated.timing(diceRotate, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(diceScale, { toValue: 0.88, useNativeDriver: true, speed: 14, bounciness: 8 }),
        Animated.timing(diceRotate, { toValue: -0.5, duration: 320, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(diceScale, { toValue: 1.06, useNativeDriver: true, speed: 12, bounciness: 6 }),
        Animated.timing(diceRotate, { toValue: 0.2, duration: 300, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(diceScale, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 4 }),
        Animated.timing(diceRotate, { toValue: 0, duration: 240, useNativeDriver: true }),
      ]),
      Animated.delay(Math.max(0, DICE_ROLL_MS - 1700)),
    ]).start(() => {
      rollingRef.current = false;
      setRolling(false);
    });
  }, [isMyTurn, gameState, socket, rolling, diceScale, diceRotate]);

  // Cycle the dice preview face while anyone is mid-roll (my roll or remote).
  useEffect(() => {
    if (!rolling && !remoteRolling) return;
    const iv = setInterval(() => {
      setDicePreview(1 + Math.floor(Math.random() * 6));
    }, 110);
    return () => clearInterval(iv);
  }, [rolling, remoteRolling]);

  const moveToken = useCallback((tokenId: number) => {
    if (!isMyTurn || gameState?.dice === null) return;
    socket?.emit(EVENTS.MOVE, { type: 'MOVE_TOKEN', tokenId });
    gameSound.playTap();
  }, [isMyTurn, gameState, socket]);

  // ── Idle safeguard ────────────────────────────────────────────────────────
  // My turn, nothing pressed: 5s silent grace → 5s visible countdown →
  // auto-roll. If the roll lands but no token is tapped within ~3.5s, auto-move
  // the first movable token. The server skips the turn at 15s as a backstop,
  // so an idle or backgrounded player can never stall the match.
  const [idleLeft, setIdleLeft] = useState<number | null>(null);
  const idleTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleMoveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rollDiceRef = useRef<() => void>(() => {});
  const moveTokenRef = useRef<(tokenId: number) => void>(() => {});
  // True only when the CURRENT dice was produced by the idle auto-roll. A
  // player who rolls manually is actively engaged — their token must never be
  // auto-moved out from under them.
  const autoRolledTurnRef = useRef(false);
  rollDiceRef.current = rollDice;
  moveTokenRef.current = moveToken;

  useEffect(() => {
    if (status !== 'active' || !isMyTurn) {
      setIdleLeft(null);
      autoRolledTurnRef.current = false;
      if (idleTickRef.current) { clearInterval(idleTickRef.current); idleTickRef.current = null; }
      if (idleMoveRef.current) { clearTimeout(idleMoveRef.current); idleMoveRef.current = null; }
      return;
    }
    if (gameState?.dice != null) {
      // Rolled but nothing tapped. Only auto-move when the roll itself was the
      // idle auto-roll (the player has stepped away); a manual roll means the
      // player is engaged and keeps control. The server's 15s skip backstop
      // still clears an abandoned rolled-token turn.
      setIdleLeft(null);
      if (!autoRolledTurnRef.current) return;
      if (idleMoveRef.current) clearTimeout(idleMoveRef.current);
      idleMoveRef.current = setTimeout(() => {
        const st = gameStateRef.current;
        const movable = st?.movableTokens;
        if (movable && movable.length > 0 &&
            (st?.currentTurnIndex ?? 0) === myPlayerIdx &&
            st?.dice != null) {
          moveTokenRef.current(movable[0]);
        }
      }, 3500);
      return () => {
        if (idleMoveRef.current) { clearTimeout(idleMoveRef.current); idleMoveRef.current = null; }
      };
    }
    // Waiting for a roll — 5s grace, then a visible 5s countdown, then auto-roll.
    let seconds = 0;
    setIdleLeft(null);
    if (idleTickRef.current) clearInterval(idleTickRef.current);
    idleTickRef.current = setInterval(() => {
      seconds += 1;
      if (seconds >= 5 && seconds < 10) setIdleLeft(10 - seconds);
      if (seconds >= 10) {
        if (idleTickRef.current) { clearInterval(idleTickRef.current); idleTickRef.current = null; }
        autoRolledTurnRef.current = true;
        rollDiceRef.current();
      }
    }, 1000);
    return () => {
      if (idleTickRef.current) { clearInterval(idleTickRef.current); idleTickRef.current = null; }
    };
  }, [status, isMyTurn, gameState?.dice, myPlayerIdx]);

  // ── Real multiplayer chat (server broadcasts to the match room) ──────────
  const sendChat = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    // Broadcast to the match room — the server echoes it to every player
    // (including me), and the CHAT listener below renders it for everyone.
    socket?.emit(EVENTS.CHAT, { text: t });
    setDraft('');
    gameSound.playTap();
  }, [socket]);

  // ── Static SVG board (memoized) ───────────────────────────────────────────
  const boardSvg = useMemo(() => {
    const C = CELL;
    const S = BOARD_SIZE;
    const elements: React.ReactElement[] = [];

    // Background for path (white grid)
    elements.push(<Rect key="bg" width={S} height={S} fill="#FFFFFF" />);

    // 1. Draw the 15x15 grid for the path
    for (let row = 0; row < 15; row++) {
      for (let col = 0; col < 15; col++) {
        const key = `${col},${row}`;
        const isRedH    = col < 6 && row < 6;
        const isGreenH  = col > 8 && row < 6;
        const isYellH   = col > 8 && row > 8;
        const isBlueH   = col < 6 && row > 8;
        const isCenter  = col >= 6 && col <= 8 && row >= 6 && row <= 8;
        const isYardOrCenter = isRedH || isBlueH || isGreenH || isYellH || isCenter;

        const isRedLane    = row === 7 && col >= 1 && col <= 5;
        const isGreenLane  = col === 7 && row >= 1 && row <= 5;
        const isYellLane   = row === 7 && col >= 9 && col <= 13;
        const isBlueLane   = col === 7 && row >= 9 && row <= 13;

        // Start cells
        const isRedStart   = col === 1 && row === 6;
        const isGreenStart = col === 8 && row === 1;
        const isYellStart  = col === 13 && row === 8;
        const isBlueStart  = col === 6 && row === 13;

        if (!isYardOrCenter) {
          let fill = '#FFFFFF';
          if (isRedLane || isRedStart) fill = PLAYER_COLORS[0];
          else if (isGreenLane || isGreenStart) fill = PLAYER_COLORS[1];
          else if (isYellLane || isYellStart) fill = PLAYER_COLORS[2];
          else if (isBlueLane || isBlueStart) fill = PLAYER_COLORS[3];

          elements.push(
            <Rect key={key} x={col*C} y={row*C} width={C} height={C}
              fill={fill} stroke="#D1D5DB" strokeWidth={0.8} />
          );

          // Stars for safe squares that are not starts
          if (SAFE_CELLS.has(key) && !isRedStart && !isGreenStart && !isYellStart && !isBlueStart) {
            elements.push(
              <Polygon key={`s${key}`}
                points={starPts(col*C + C/2, row*C + C/2, C*0.35, C*0.15, 5)}
                fill="none" stroke="#9CA3AF" strokeWidth={1.5} strokeLinejoin="round"
              />
            );
          }

          // Arrows for start cells
          if (isRedStart || isGreenStart || isYellStart || isBlueStart) {
            const cx = col*C + C/2;
            const cy = row*C + C/2;
            let pts = "";
            if (isRedStart)   pts = `${cx-C*0.2},${cy-C*0.2} ${cx+C*0.2},${cy} ${cx-C*0.2},${cy+C*0.2}`; // Right arrow
            if (isGreenStart) pts = `${cx-C*0.2},${cy-C*0.2} ${cx+C*0.2},${cy-C*0.2} ${cx},${cy+C*0.2}`; // Down arrow
            if (isYellStart)  pts = `${cx+C*0.2},${cy-C*0.2} ${cx-C*0.2},${cy} ${cx+C*0.2},${cy+C*0.2}`; // Left arrow
            if (isBlueStart)  pts = `${cx-C*0.2},${cy+C*0.2} ${cx+C*0.2},${cy+C*0.2} ${cx},${cy-C*0.2}`; // Up arrow
            elements.push(<Polygon key={`arr${key}`} points={pts} fill="#FFFFFF" />);
          }
        }
      }
    }

    // 2. Draw the 4 Corner Yards
    const yards = [
      { x: 0, y: 0, color: PLAYER_COLORS[0] }, // TL Red
      { x: 9*C, y: 0, color: PLAYER_COLORS[1] }, // TR Green
      { x: 9*C, y: 9*C, color: PLAYER_COLORS[2] }, // BR Yellow
      { x: 0, y: 9*C, color: PLAYER_COLORS[3] }, // BL Blue
    ];

    yards.forEach((yard, i) => {
      // Large colored square
      elements.push(<Rect key={`yBg${i}`} x={yard.x} y={yard.y} width={6*C} height={6*C} fill={yard.color} />);
      // Inner white square
      elements.push(<Rect key={`yWh${i}`} x={yard.x + C} y={yard.y + C} width={4*C} height={4*C} fill="#FFFFFF" />);
      
      // 4 circular home slots for tokens
      const slotCenters = [
        { cx: yard.x + 2*C, cy: yard.y + 2*C },
        { cx: yard.x + 4*C, cy: yard.y + 2*C },
        { cx: yard.x + 2*C, cy: yard.y + 4*C },
        { cx: yard.x + 4*C, cy: yard.y + 4*C },
      ];
      slotCenters.forEach((pos, j) => {
        elements.push(
          <Circle key={`slot${i}-${j}`} cx={pos.cx} cy={pos.cy} r={C*0.7}
            fill="none" stroke={yard.color} strokeWidth={C*0.3} />
        );
      });
    });

    // 3. Center Triangles
    const cx = 7.5*C, cy = 7.5*C, r = 1.5*C;
    const triangles = [
      { pts: `${cx},${cy} ${cx-r},${cy+r} ${cx-r},${cy-r}`, color: PLAYER_COLORS[0] }, // Left (Red)
      { pts: `${cx},${cy} ${cx-r},${cy-r} ${cx+r},${cy-r}`, color: PLAYER_COLORS[1] }, // Top (Green)
      { pts: `${cx},${cy} ${cx+r},${cy-r} ${cx+r},${cy+r}`, color: PLAYER_COLORS[2] }, // Right (Yellow)
      { pts: `${cx},${cy} ${cx-r},${cy+r} ${cx+r},${cy+r}`, color: PLAYER_COLORS[3] }, // Bottom (Blue)
    ];
    triangles.forEach((t, i) => {
      elements.push(<Polygon key={`tri${i}`} points={t.pts} fill={t.color} />);
    });

    return (
      <Svg width={S} height={S} style={StyleSheet.absoluteFill}>
        {elements}
      </Svg>
    );
  }, []);

  // ── Token renderer ────────────────────────────────────────────────────────
  const renderTokens = () => {
    if (!gameState?.tokens) return null;
    const elements: React.ReactElement[] = [];

    Object.entries(gameState.tokens).forEach(([uid, tks]: [string, any]) => {
      const pi      = gameState.turnOrder?.indexOf(uid) ?? 0;
      const color   = PLAYER_COLORS[pi % 4];
      const colorD  = PLAYER_COLORS_D[pi % 4];
      const isMe    = uid === userId;
      const canMovePl = isMyTurn && isMe && gameState.dice !== null;
      const info    = playerInfo[uid];
      const pData = players?.find(p => p.id === uid) || info;
          const avatarUri = isMe ? (myAvatar || null) : (pData?.avatar || null);

      (tks || []).forEach((token: any, tidx: number) => {
        const tKey = `${uid}-${token.id}`;
        const { x, y } = getTokenPos(pi, token.id, token.pos ?? -1);
        const anim   = getAnim(tKey, x, y);
        const canMove = canMovePl && (gameState.movableTokens?.includes(token.id) ?? true);
        // Location-pin token: circular head (profile pic inside) + pointy tail
        const HEAD  = CELL * 0.72;
        const TAIL_W = HEAD * 0.66;
        const TAIL_H = HEAD * 0.5;
        const TOKEN_H = HEAD + TAIL_H;

        elements.push(
          <Animated.View key={tKey} style={{
            position: 'absolute',
            width: HEAD, height: TOKEN_H,
            left: Animated.add(anim.x, new Animated.Value(-HEAD / 2)),
            top:  Animated.add(anim.y, new Animated.Value(-HEAD / 2)),
            zIndex: canMove ? 30 : isMe ? 20 : 10,
            alignItems: 'center',
          }}>
            <TouchableOpacity
              onPress={() => canMove && moveToken(token.id)}
              activeOpacity={canMove ? 0.7 : 1}
              style={{ width: HEAD, height: TOKEN_H, alignItems: 'center' }}
            >
              {/* Pulsing highlight ring */}
              {canMove && <PulseRing size={HEAD} color={color} />}

              {/* Head — circle with profile pic */}
              <View style={{
                width: HEAD, height: HEAD, borderRadius: HEAD / 2,
                backgroundColor: color,
                borderColor: canMove ? '#FFFFFF' : 'rgba(255,255,255,0.6)',
                borderWidth: canMove ? 2.5 : 2,
                shadowColor: color,
                shadowOpacity: canMove ? 1 : 0.55,
                shadowRadius: canMove ? 9 : 4,
                elevation: canMove ? 13 : 6,
                alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
              }}>
                {avatarUri ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={{
                      width: HEAD - 6, height: HEAD - 6,
                      borderRadius: (HEAD - 6) / 2,
                      borderWidth: 1.5, borderColor: colorD,
                    }}
                  />
                ) : (
                  <View style={{
                    width: HEAD - 6, height: HEAD - 6,
                    borderRadius: (HEAD - 6) / 2,
                    backgroundColor: colorD,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: HEAD * 0.3, fontWeight: '900', color: '#FFF' }}>
                      {isMe ? (myName?.[0] || 'Y') : (info?.name?.[0] || (pi + 1).toString())}
                    </Text>
                  </View>
                )}
              </View>

              {/* Pin point tail — dark outline + colored fill, like the reference */}
              <View style={{
                width: TAIL_W + 4, height: TAIL_H + 4, marginTop: -2,
                alignItems: 'center', justifyContent: 'flex-start',
              }}>
                <View style={{
                  width: 0, height: 0,
                  borderLeftWidth: (TAIL_W + 4) / 2,
                  borderRightWidth: (TAIL_W + 4) / 2,
                  borderBottomWidth: TAIL_H + 4,
                  borderLeftColor: 'transparent',
                  borderRightColor: 'transparent',
                  borderBottomColor: '#1E293B',
                }} />
                <View style={{
                  width: 0, height: 0, marginTop: -(TAIL_H + 2),
                  borderLeftWidth: TAIL_W / 2,
                  borderRightWidth: TAIL_W / 2,
                  borderBottomWidth: TAIL_H,
                  borderLeftColor: 'transparent',
                  borderRightColor: 'transparent',
                  borderBottomColor: color,
                }} />
              </View>
            </TouchableOpacity>
          </Animated.View>
        );
      });
    });
    return elements;
  };

  // ── Player info strip ─────────────────────────────────────────────────────
  const renderPlayerStrip = () => {
    if (!gameState?.tokens) return null;
    const playerIds = Object.keys(gameState.tokens);
    return (
      <View style={styles.playerStrip}>
        {playerIds.map((uid, i) => {
          const isMe    = uid === userId;
          const color   = PLAYER_COLORS[i % 4];
          const info    = playerInfo[uid];
          const avatarUri = isMe ? (myAvatar || null) : (info?.avatar || null);
          const label = isMe ? (myName || 'You') : ((playerInfo[uid] as any)?.name || `P${i+1}`);
          const isActive = (gameState.currentTurnIndex ?? 0) === i;

          return (
            <View key={uid} style={[styles.playerChip, isActive && { borderColor: color + 'CC' }]}>
              {/* Tiny avatar coin */}
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={[styles.chipAvatar, { borderColor: color }]} />
              ) : (
                <View style={[styles.chipAvatarFallback, { backgroundColor: color }]}>
                  <Text style={styles.chipAvatarText}>{label[0]}</Text>
                </View>
              )}
              <View>
                <Text style={[styles.chipName, { color: isMe ? color : '#94A3B8' }]} numberOfLines={1}>
                  {isMe ? 'You' : label}
                </Text>
                {isActive && (
                  <View style={[styles.activeDot, { backgroundColor: color }]} />
                )}
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  // ── State helpers ─────────────────────────────────────────────────────────
  const face    = gameState?.dice ?? null;
  const hasDice = face !== null;
  const curIdx  = gameState?.currentTurnIndex ?? 0;
  const curColor = PLAYER_COLORS[curIdx % 4];
  // Die face shown on everyone's screen: preview while tumbling, else the result
  const diceFace = (rolling || remoteRolling) ? dicePreview : (hasDice ? face : null);
  // Corner-anchored die position — pushed toward the board center so it never
  // collides with the corner avatar card or the chat button at the screen corner.
  const DIE_ANCHOR: Record<number, any> = {
    0: { top: 96, left: 96 },
    1: { top: 96, right: 96 },
    2: { bottom: 96, right: 96 },
    3: { bottom: 96, left: 96 },
  };
  const dieAnchor = DIE_ANCHOR[curIdx % 4] || DIE_ANCHOR[0];
  // My corner index — computed from the SAME source the corner cards use
  // (turnOrder order), so the chat button + popups always land on my corner.
  const myCornerIdx = (gameState?.turnOrder || []).indexOf(userId);
  const remoteUid = remoteRolling;
  const remoteIdx = remoteUid ? (gameState?.turnOrder || []).indexOf(remoteUid) : -1;

  // ── Corner avatar cards (reference-style) ─────────────────────────────────
  const renderCornerCards = () => {
    if (!gameState?.tokens) return null;
    const playerIds = Object.keys(gameState.tokens);
    return (
      <>
        {playerIds.slice(0, 4).map((uid, i) => {
          const pos = CORNER_POS[i];
          if (!pos) return null;
          const isMe    = uid === userId;
          const color   = PLAYER_COLORS[i % 4];
          const info    = playerInfo[uid];
          const avatarUri = isMe ? (myAvatar || null) : (info?.avatar || null);
          const label = isMe ? (myName || 'You') : (info?.name || `P${i + 1}`);
          const isActive = (gameState.currentTurnIndex ?? 0) === i;
          return (
            <View
              key={uid}
              pointerEvents="none"
              style={[styles.cornerCard, {
                [pos.align]: 10,
                [pos.vert]: 10,
                borderColor: isActive ? '#FDE68A' : 'rgba(124,168,255,0.45)',
                backgroundColor: isActive ? 'rgba(6,20,90,0.85)' : 'rgba(4,12,56,0.6)',
              }]}
            >
              <View style={[styles.cornerAvatarFrame, { borderColor: isActive ? '#FDE68A' : '#5B82EC' }]}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.cornerAvatar} />
                ) : (
                  <View style={[styles.cornerAvatarPh, { backgroundColor: color }]}>
                    <Text style={styles.cornerAvatarInitial}>{(label || '?')[0].toUpperCase()}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.cornerName, { color: isActive ? '#FFF' : '#B9CBF8' }]} numberOfLines={1}>
                {isMe ? 'You' : label}
              </Text>
            </View>
          );
        })}
      </>
    );
  };

  // ── Loading screens ───────────────────────────────────────────────────────
  if (status === 'connecting' || status === 'waiting') {
    return (
      <LinearGradient colors={[BG_TOP, BG_BOTTOM]} style={styles.fullCenter}>
        <Text style={styles.splashEmoji}>{status === 'connecting' ? '🎲' : '⏳'}</Text>
        <Text style={styles.splashTitle}>Ludo Classic</Text>
        <Text style={styles.splashSub}>{status === 'connecting' ? 'Connecting…' : 'Waiting for players…'}</Text>
        <LoadingDots />
      </LinearGradient>
    );
  }

  const spin = diceRotate.interpolate({ inputRange: [-1, 1], outputRange: ['-14deg', '14deg'] });

  return (
    <LinearGradient colors={[BG_TOP, BG_BOTTOM]} style={styles.container}>

      {/* ─ Stars backdrop ─ */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {STARS.map((s, i) => (
          <View key={i} style={{
            position: 'absolute', left: `${s.x}%` as any, top: `${s.y}%` as any,
            width: s.r * 2, height: s.r * 2, borderRadius: s.r,
            backgroundColor: '#FFFFFF', opacity: s.o,
          }} />
        ))}
      </View>

      {/* ─ Turn banner ─ */}
      <View style={[styles.turnBanner, { borderColor: curColor + '88', backgroundColor: 'rgba(5,13,58,0.65)' }]}>
        <View style={[styles.turnDot, { backgroundColor: curColor }]} />
        <Text style={[styles.turnText, { color: '#F8FAFC' }]} numberOfLines={1}>
          {remoteRolling
            ? `🎲 ${PLAYER_NAMES[remoteIdx % 4]} is rolling…`
            : isMyTurn
              ? hasDice ? `🎯 Rolled ${face} — Tap a token!` : '🎲 Your Turn — Tap the die!'
              : `${PLAYER_NAMES[curIdx % 4]}'s Turn`}
        </Text>
      </View>

      {/* Idle countdown — visible only during my turn's 5s auto-roll window */}
      {idleLeft !== null && (
        <View style={styles.autoRollPill}>
          <Ionicons name="time-outline" size={12} color="#FDE68A" />
          <Text style={styles.autoRollText}>Auto-roll in {idleLeft}s</Text>
        </View>
      )}

      {/* ─ Board ─ */}
      <View style={styles.boardWrap}>
        <LinearGradient
          colors={[curColor + '66', 'transparent']}
          style={[StyleSheet.absoluteFill, { borderRadius: 14 }]}
          pointerEvents="none"
        />
        <View style={[styles.board, { width: BOARD_SIZE, height: BOARD_SIZE }]}>
          {boardSvg}
          {renderTokens()}
        </View>
      </View>

      {/* ─ Corner avatar cards (like the reference) ─ */}
      {renderCornerCards()}

      {/* Chat bubbles popping over the sender's corner card */}
      {chatPopups.map(pop => (
        <CornerBubble
          key={pop.id}
          pop={pop}
          cornerIdx={pop.cornerIdx}
          onDone={(id) => setChatPopups(p => p.filter(x => x.id !== id))}
        />
      ))}

      {/* ─ Die — anchored to the active player's corner, tap to roll ─ */}
      <View style={[styles.dieArea, dieAnchor]}>
        <TouchableOpacity onPress={rollDice} disabled={!isMyTurn || hasDice || rolling} activeOpacity={0.85}>
          <Animated.View style={[
            styles.dieGlowWrap,
            diceFace !== null && styles.dieGlowWrapRolled,
            { transform: [{ scale: diceScale }, { rotate: spin }] },
          ]}>
            <LinearGradient
              colors={diceFace !== null ? ['#FDE68A', '#F8FAFC'] : ['#FFFFFF', '#DBE4F6']}
              style={styles.dieBody}
            >
              {diceFace !== null ? (
                (DOT_POS[diceFace] || []).map(([dx, dy], i) => (
                  <View key={i} style={[styles.dot, styles.dotDark, { left: `${dx}%` as any, top: `${dy}%` as any }]} />
                ))
              ) : (
                <Text style={styles.diceQ}>?</Text>
              )}
            </LinearGradient>
          </Animated.View>
        </TouchableOpacity>
        <Text style={styles.dieHint}>
          {rolling || remoteRolling
            ? 'Rolling…'
            : diceFace !== null
              ? isMyTurn ? 'Tap a token' : `${PLAYER_NAMES[curIdx % 4]} rolled ${diceFace}`
              : isMyTurn ? 'Tap to roll' : `${PLAYER_NAMES[curIdx % 4]} to roll…`}
        </Text>
      </View>

      {/* ─ Chat button — fixed bottom-centre, reference-style orange bubble ─ */}
      <View pointerEvents="box-none" style={styles.chatBtnPos}>
        <TouchableOpacity style={styles.chatBtn} onPress={() => setChatOpen(true)} activeOpacity={0.85}>
          <Ionicons name="chatbubble" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* ─ Toast ─ */}
      {toast && (
        <Animated.View style={[styles.toast, {
          opacity: toastAnim,
          transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
        }]}>
          <LinearGradient colors={['#1E1B4B', '#0F172A']} style={styles.toastInner}>
            <Text style={styles.toastText}>{toast}</Text>
          </LinearGradient>
        </Animated.View>
      )}

      {/* ─ Chat sheet ─ */}
      <ChatSheet
        visible={chatOpen}
        messages={messages}
        draft={draft}
        onDraftChange={setDraft}
        onSend={(t) => sendChat(t)}
        onClose={() => setChatOpen(false)}
        scrollRef={chatScroll}
        inputRef={chatInputRef}
      />
    </LinearGradient>
  );
}

// ── Pulsing ring on movable tokens ────────────────────────────────────────────
function PulseRing({ size, color }: { size: number; color: string }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1.4, duration: 650, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1,   duration: 650, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={{
      position: 'absolute', top: 0, left: 0,
      width: size, height: size, borderRadius: size / 2,
      borderWidth: 2.5, borderColor: color,
      opacity: anim.interpolate({ inputRange: [1, 1.4], outputRange: [0.85, 0] }),
      transform: [{ scale: anim }],
    }} />
  );
}

// ── Loading dots ──────────────────────────────────────────────────────────────
function LoadingDots() {
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 24 }}>
      {[0, 1, 2].map(i => <Dot key={i} delay={i * 200} />)}
    </View>
  );
}
function Dot({ delay }: { delay: number }) {
  const a = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(a, { toValue: 1,   duration: 400, useNativeDriver: true }),
      Animated.timing(a, { toValue: 0.3, duration: 400, useNativeDriver: true }),
    ])).start();
  }, []);
  return <Animated.View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#7C3AED', opacity: a }} />;
}

// ── Chat bubble floating over a player's corner card ──────────────────────────
function CornerBubble({ pop, cornerIdx, onDone }: {
  pop: { id: number; uid: string; name: string; text: string; color: string };
  cornerIdx: number;
  onDone: (id: number) => void;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onDone(pop.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pos = CORNER_POS[cornerIdx % 4];
  const vertKey = pos?.vert === 'bottom' ? 'bottom' : 'top';
  const vertVal = pos?.vert === 'bottom' ? 118 : 88;
  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute',
      [pos?.align ?? 'left']: 12,
      [vertKey]: vertVal,
      maxWidth: 190,
      opacity: anim,
      transform: [{
        translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }),
      }],
      zIndex: 60,
    }}>
      <View style={[styles.bubble, { borderLeftColor: pop.color }]}>
        <Text style={[styles.bubbleName, { color: pop.color }]} numberOfLines={1}>{pop.name}</Text>
        <Text style={styles.bubbleText} numberOfLines={2}>{pop.text}</Text>
      </View>
    </Animated.View>
  );
}

// ── Chat sheet modal ──────────────────────────────────────────────────────────
function ChatSheet({
  visible, messages, draft, onDraftChange, onSend, onClose, scrollRef, inputRef,
}: {
  visible: boolean;
  messages: ChatMsg[];
  draft: string;
  onDraftChange: (t: string) => void;
  onSend: (t: string) => void;
  onClose: () => void;
  scrollRef: React.RefObject<ScrollView | null>;
  inputRef: React.RefObject<TextInput | null>;
}) {
  const submit = () => {
    onSend(draft);
    inputRef.current?.focus();
  };

  // Quick-send emoji bar for fast replies
  const QUICK_EMOJIS = ['😄', '😂', '🔥', '👍', '🎉', '😮', '💪', '❤️'];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.chatWrap}>
        <TouchableOpacity style={styles.chatDismiss} activeOpacity={1} onPress={onClose} />
        <View style={styles.chatSheet}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatTitle}>💬 Match Chat</Text>
            <View style={styles.chatLiveTag}>
              <View style={styles.chatLiveDot} />
              <Text style={styles.chatLiveText}>live</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color="#C4B5FD" />
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.chatList}
            contentContainerStyle={styles.chatListContent}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
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
                <View style={[styles.chatBubbleRow, { borderLeftColor: m.color }]}>
                  <Text style={styles.chatMsgText}>{m.text}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.chatEmojiRow}>
            {QUICK_EMOJIS.map((e) => (
              <TouchableOpacity
                key={e}
                style={styles.chatEmojiBtn}
                onPress={() => onSend(e)}
                activeOpacity={0.7}
              >
                <Text style={styles.chatEmojiText}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.chatInputRow}>
            <TextInput
              ref={inputRef}
              style={styles.chatInput}
              value={draft}
              onChangeText={onDraftChange}
              placeholder="Type a message…"
              placeholderTextColor="#6B7280"
              multiline
              maxLength={140}
              onSubmitEditing={submit}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[styles.chatSend, !draft.trim() && { opacity: 0.45 }]}
              onPress={submit}
              disabled={!draft.trim()}
              activeOpacity={0.8}
            >
              <Ionicons name="send" size={18} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', paddingTop: 6, paddingBottom: 6 },
  fullCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  splashEmoji: { fontSize: 64, marginBottom: 10 },
  splashTitle: { fontSize: 26, fontWeight: '900', color: '#F1F5F9', marginBottom: 5 },
  splashSub:   { fontSize: 14, color: '#64748B' },

  turnBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 18, paddingVertical: 8,
    borderRadius: 24, borderWidth: 1.5,
    marginBottom: 8, alignSelf: 'center',
  },
  turnDot:  { width: 8, height: 8, borderRadius: 4 },
  turnText: { fontSize: 13, fontWeight: '800', maxWidth: 260 },
  autoRollPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(253,230,138,0.14)',
    borderWidth: 1, borderColor: 'rgba(253,230,138,0.4)',
    alignSelf: 'center', marginBottom: 6,
  },
  autoRollText: { fontSize: 11, fontWeight: '800', color: '#FDE68A' },

  // Player strip
  playerStrip: {
    flexDirection: 'row', gap: 8, marginBottom: 8,
    paddingHorizontal: 12, flexWrap: 'wrap', justifyContent: 'center',
  },
  playerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  chipAvatar: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2,
  },
  chipAvatarFallback: {
    width: 26, height: 26, borderRadius: 13,
    justifyContent: 'center', alignItems: 'center',
  },
  chipAvatarText: { fontSize: 11, fontWeight: '900', color: '#FFF' },
  chipName: { fontSize: 11, fontWeight: '700', maxWidth: 70 },
  activeDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 2 },

  // Board
  boardWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 14, padding: 3 },
  board: {
    borderRadius: 10, overflow: 'hidden',
    borderWidth: 1.5, borderColor: 'rgba(124,58,237,0.4)',
    elevation: 20, shadowColor: '#7C3AED',
    shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
  },

  // Token
  tokenOuter: {
    position: 'absolute', inset: 0,
    justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden',
  },
  tokenShine: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: '50%', backgroundColor: 'rgba(255,255,255,0.18)',
  },
  tokenInner: { justifyContent: 'center', alignItems: 'center' },
  tokenLabel: { fontWeight: '900', color: '#FFF' },

  // Corner avatar cards
  cornerCard: {
    position: 'absolute',
    alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8,
    borderRadius: 16, borderWidth: 1.5,
    shadowColor: '#6FA0FF', shadowOpacity: 0.45, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 10,
    minWidth: 66,
  },
  cornerAvatarFrame: {
    width: 42, height: 42, borderRadius: 12,
    borderWidth: 2, padding: 2,
    backgroundColor: 'rgba(8,26,100,0.85)',
    alignItems: 'center', justifyContent: 'center',
  },
  cornerAvatar: { width: 34, height: 34, borderRadius: 9 },
  cornerAvatarPh: {
    width: 34, height: 34, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  cornerAvatarInitial: { color: '#FFF', fontWeight: '900', fontSize: 15 },
  cornerName: { fontSize: 10, fontWeight: '800', marginTop: 4, maxWidth: 70, textAlign: 'center' },
  cornerPct: { fontSize: 11, fontWeight: '900', marginTop: 1 },

  // Die — absolutely anchored near the active player's corner card
  dieArea: { position: 'absolute', alignItems: 'center', zIndex: 40 },
  dieGlowWrap: {
    width: 56, height: 56, borderRadius: 15,
    borderWidth: 2.5, borderColor: '#7FA6FF',
    backgroundColor: '#FFFFFF',
    elevation: 14, shadowColor: '#6FA0FF',
    shadowOpacity: 0.8, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
  },
  dieGlowWrapRolled: { borderColor: '#FDE68A', shadowColor: '#FDE68A' },
  dieBody: {
    width: 56, height: 56, borderRadius: 13,
    justifyContent: 'center', alignItems: 'center', position: 'relative',
  },
  dot: {
    position: 'absolute', width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#F8FAFC',
    transform: [{ translateX: -5 }, { translateY: -5 }],
  },
  dotDark: { backgroundColor: '#0A2472' },
  diceQ: { fontSize: 26, color: '#0A2472', fontWeight: '900' },
  dieHint: { marginTop: 5, color: '#C7D6FF', fontSize: 11, fontWeight: '700', textAlign: 'center', maxWidth: 120 },

  // Chat button (reference-style orange bubble, bottom-centre)
  chatBtnPos: {
    position: 'absolute', bottom: 14, alignSelf: 'center', zIndex: 50,
  },
  chatBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F97316',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFF',
    elevation: 10, shadowColor: '#F97316',
    shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  chatEmojiRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8,
  },
  chatEmojiBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  chatEmojiText: { fontSize: 17 },

  // Chat popup bubble
  bubble: {
    backgroundColor: 'rgba(8,16,64,0.95)',
    borderRadius: 12,
    borderWidth: 1, borderLeftWidth: 3,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10, paddingVertical: 6,
    elevation: 8,
  },
  bubbleName: { fontSize: 10, fontWeight: '900', marginBottom: 1 },
  bubbleText: { color: '#E2E8F0', fontSize: 12, fontWeight: '600' },

  // Chat sheet
  chatWrap: { flex: 1, justifyContent: 'flex-end' },
  chatDismiss: { flex: 1, backgroundColor: 'rgba(2,6,23,0.5)' },
  chatSheet: {
    backgroundColor: '#0B1026',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1.5, borderColor: 'rgba(124,58,237,0.35)',
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 20,
    maxHeight: '62%',
  },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingHorizontal: 4 },
  chatTitle: { color: '#F1F5F9', fontSize: 16, fontWeight: '900', flex: 1 },
  chatLiveTag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(34,197,94,0.16)',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  chatLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  chatLiveText: { color: '#4ADE80', fontSize: 10, fontWeight: '800' },
  chatList: { maxHeight: 320, flexGrow: 0 },
  chatListContent: { paddingBottom: 8 },
  chatEmpty: { color: '#64748B', fontSize: 13, textAlign: 'center', paddingVertical: 16, fontStyle: 'italic' },
  chatMsg: { marginBottom: 8 },
  chatMsgMeta: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 2 },
  chatMsgName: { fontSize: 11, fontWeight: '900' },
  chatMsgTime: { fontSize: 9, color: '#64748B' },
  chatBubbleRow: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10, borderLeftWidth: 3,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  chatMsgText: { color: '#E2E8F0', fontSize: 14, lineHeight: 19 },
  chatInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 6 },
  chatInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    color: '#F1F5F9',
    paddingHorizontal: 12, paddingVertical: 8,
    maxHeight: 90, fontSize: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  chatSend: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#7C3AED',
    alignItems: 'center', justifyContent: 'center',
  },

  // Toast
  toast: { position: 'absolute', bottom: 96, alignSelf: 'center', borderRadius: 24, overflow: 'hidden', elevation: 18 },
  toastInner: { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 24, borderWidth: 1.5, borderColor: 'rgba(124,58,237,0.45)' },
  toastText: { color: '#F1F5F9', fontSize: 15, fontWeight: '900' },
});
