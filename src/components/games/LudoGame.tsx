import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Polygon, Circle, Defs, LinearGradient as SvgGrad, Stop, Rect } from 'react-native-svg';
import type { HtmlGameResult } from '../../games/types';
import { createGameEngineSocket } from '../../services/socketClient';
import { gameSound, useTurnSound } from '../../services/gameSound';

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

// Player progress % — sum of token path positions vs a full 4-token journey
function playerProgress(tokens: any[] | undefined): number {
  const tks = Array.isArray(tokens) ? tokens : [];
  if (tks.length === 0) return 0;
  let total = 0;
  tks.forEach((t: any) => {
    const p = Number(t?.pos ?? -1);
    if (p < 0) return;
    total += Math.min(1, (p + 1) / 57);
  });
  return Math.round((total / 4) * 100);
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
  START: 'START', SYNC: 'SYNC', GAME_OVER: 'GAME_OVER', ERROR: 'ERROR',
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
  onComplete: (result: HtmlGameResult) => void;
};

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
  matchId, userId, wsToken, players, onComplete
}: Props) {
  const [socket, setSocket] = useState<any>(null);
  
  const me = players?.find(p => p.id === userId);
  const myName = me?.name || 'You';
  const myAvatar = me?.avatar || null;
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'active' | 'finished'>('connecting');
  const [gameState, setGameState] = useState<any>(null);
  const [myPlayerIdx, setMyPlayerIdx] = useState(0);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Player info from socket (name + avatar for opponents)
  const [playerInfo, setPlayerInfo] = useState<Record<string, { name: string; avatar?: string }>>({});

  const diceScale  = useRef(new Animated.Value(1)).current;
  const diceRotate = useRef(new Animated.Value(0)).current;
  const toastAnim  = useRef(new Animated.Value(0)).current;

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
      const players: any[] = data.state?.players || data.state?.metadata?.players || [];
      const idx = players.findIndex((p: any) => p.userId === userId);
      setMyPlayerIdx(idx >= 0 ? idx : 0);

      // Collect player info (name / avatar)
      const info: Record<string, { name: string; avatar?: string }> = {};
      players.forEach((p: any) => {
        info[p.userId] = { name: p.name || p.username || 'Player', avatar: p.avatarUrl || p.avatar };
      });
      // Inject self
      info[userId] = { name: myName || 'You', avatar: myAvatar || undefined };
      setPlayerInfo(info);

      if (ps) setGameState(ps);
      setStatus(data.state?.status === 'ACTIVE' ? 'active' : 'waiting');
      s.emit(EVENTS.READY);
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
    return () => {
      s.disconnect();
    };
  }, [matchId, userId, wsToken]);

  useEffect(() => {
    if (gameState) setIsMyTurn((gameState.currentTurnIndex ?? 0) === myPlayerIdx);
  }, [gameState, myPlayerIdx]);

  // Turn-change sound + haptic when it becomes your turn
  useTurnSound(isMyTurn, status === 'active');

  const rollDice = useCallback(() => {
    if (!isMyTurn || gameState?.dice !== null) return;
    socket?.emit(EVENTS.MOVE, { type: 'ROLL' });
    gameSound.playTap();
    diceRotate.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.spring(diceScale, { toValue: 1.3, useNativeDriver: true, speed: 80 }),
        Animated.timing(diceRotate, { toValue: 1, duration: 100, useNativeDriver: true }),
      ]),
      Animated.spring(diceScale, { toValue: 0.9, useNativeDriver: true, speed: 60 }),
      Animated.parallel([
        Animated.spring(diceScale, { toValue: 1, useNativeDriver: true, speed: 30 }),
        Animated.timing(diceRotate, { toValue: 0, duration: 120, useNativeDriver: true }),
      ]),
    ]).start();
  }, [isMyTurn, gameState, socket]);

  const moveToken = useCallback((tokenId: number) => {
    if (!isMyTurn || gameState?.dice === null) return;
    socket?.emit(EVENTS.MOVE, { type: 'MOVE_TOKEN', tokenId });
    gameSound.playTap();
  }, [isMyTurn, gameState, socket]);

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
        const HEAD  = CELL * 0.74;
        const POINT = HEAD * 0.34;
        const TOKEN_H = HEAD + POINT * 0.72;

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

              {/* Pin point tail */}
              <View style={{
                width: POINT, height: POINT, borderRadius: 4,
                backgroundColor: color,
                transform: [{ rotate: '45deg' }],
                marginTop: -POINT * 0.35,
                borderWidth: 1.5, borderColor: '#FFF',
              }} />
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
  const face    = gameState?.dice;
  const hasDice = face !== null && face !== undefined;
  const curIdx  = gameState?.currentTurnIndex ?? 0;
  const curColor = PLAYER_COLORS[curIdx % 4];

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
          const pct = playerProgress(gameState.tokens[uid]);
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
              <Text style={[styles.cornerPct, { color }]}>{pct}%</Text>
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

  const spin = diceRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '15deg'] });

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
          {isMyTurn
            ? hasDice ? `🎯 Rolled ${face} — Tap a token!` : '🎲 Your Turn — Tap the die!'
            : `${PLAYER_NAMES[curIdx % 4]}'s Turn`}
        </Text>
      </View>

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

      {/* ─ Die — bottom center, tap to roll ─ */}
      <View style={styles.dieArea}>
        <TouchableOpacity onPress={rollDice} disabled={!isMyTurn || hasDice} activeOpacity={0.85}>
          <Animated.View style={[
            styles.dieGlowWrap,
            hasDice && styles.dieGlowWrapRolled,
            { transform: [{ scale: diceScale }, { rotate: spin }] },
          ]}>
            <LinearGradient
              colors={hasDice ? ['#FDE68A', '#F8FAFC'] : ['#FFFFFF', '#DBE4F6']}
              style={styles.dieBody}
            >
              {hasDice ? (
                (DOT_POS[face] || []).map(([dx, dy], i) => (
                  <View key={i} style={[styles.dot, styles.dotDark, { left: `${dx}%` as any, top: `${dy}%` as any }]} />
                ))
              ) : (
                <Text style={styles.diceQ}>?</Text>
              )}
            </LinearGradient>
          </Animated.View>
        </TouchableOpacity>
        <Text style={styles.dieHint}>
          {hasDice
            ? `Rolled ${face} — tap a token`
            : isMyTurn ? 'Tap the die to roll' : `${PLAYER_NAMES[curIdx % 4]}'s turn…`}
        </Text>
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

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', paddingTop: 8, paddingBottom: 8 },
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
  boardWrap: { justifyContent: 'center', alignItems: 'center', borderRadius: 14, padding: 3 },
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

  // Die — bottom center (reference style: white die, blue glow)
  dieArea: { alignItems: 'center', marginTop: 12 },
  dieGlowWrap: {
    width: 62, height: 62, borderRadius: 16,
    borderWidth: 2.5, borderColor: '#7FA6FF',
    backgroundColor: '#FFFFFF',
    elevation: 14, shadowColor: '#6FA0FF',
    shadowOpacity: 0.8, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
  },
  dieGlowWrapRolled: { borderColor: '#FDE68A', shadowColor: '#FDE68A' },
  dieBody: {
    width: 62, height: 62, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', position: 'relative',
  },
  dot: {
    position: 'absolute', width: 11, height: 11, borderRadius: 5.5,
    backgroundColor: '#F8FAFC',
    transform: [{ translateX: -5.5 }, { translateY: -5.5 }],
  },
  dotDark: { backgroundColor: '#0A2472' },
  diceQ: { fontSize: 28, color: '#0A2472', fontWeight: '900' },
  dieHint: { marginTop: 6, color: '#C7D6FF', fontSize: 12, fontWeight: '700' },

  // Toast
  toast: { position: 'absolute', bottom: 96, alignSelf: 'center', borderRadius: 24, overflow: 'hidden', elevation: 18 },
  toastInner: { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 24, borderWidth: 1.5, borderColor: 'rgba(124,58,237,0.45)' },
  toastText: { color: '#F1F5F9', fontSize: 15, fontWeight: '900' },
});
