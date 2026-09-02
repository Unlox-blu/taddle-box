/**
 * SnakeLadderGame — pure renderer.
 *
 * Receives all game state + callbacks from SnakeLadderRuntime via props.
 * No socket. No game logic. Pure pixels.
 */

import React, { useEffect, useRef, useMemo, useCallback, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  Image, Dimensions, Modal, ScrollView, TextInput,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Svg, {
  Line, Circle, Path, Defs, LinearGradient as SvgGrad, Stop, G, Ellipse, Polygon, Text as SvgText,
} from "react-native-svg";
import type { HtmlGameResult, PlayerContext } from "../../../../games/types";
import { useGameContainer } from "../../../../games/useGameContainer";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const GRID = 10;
const FALLBACK_BOARD = Math.min(Math.floor(SCREEN_W - 24), 400, Math.floor(SCREEN_H - 340));

const SNAKES: Record<number, number> = {
  99: 80, 95: 75, 92: 88, 89: 58, 74: 53,
  62: 19, 64: 60, 46: 25, 49: 11, 16: 6,
};
const LADDERS: Record<number, number> = {
  87: 94, 78: 98, 71: 91, 51: 67, 36: 44,
  21: 42, 28: 84, 15: 26, 2: 38, 7: 14, 8: 31,
};
const SNAKE_KEYS = Object.keys(SNAKES).map(Number);

const CELL_A = "#23205C";
const CELL_B = "#1C194E";
const SNAKE_CELL = "#8A2433";
const LADDER_CELL = "#0F6E63";

const PLAYER_COLORS = ["#EF4444", "#3B82F6", "#22C55E", "#EAB308"];
const PLAYER_DARK = ["#B91C1C", "#1D4ED8", "#15803D", "#A16207"];

const SNAKE_STYLES = [
  { body: "#F97316", head: "#DC2626", dark: "#9A3412", pattern: "#7C2D12" },
  { body: "#3B82F6", head: "#1D4ED8", dark: "#1E3A8A", pattern: "#1E3A8A" },
  { body: "#22C55E", head: "#16A34A", dark: "#166534", pattern: "#166534" },
  { body: "#A855F7", head: "#7E22CE", dark: "#6B21A8", pattern: "#6B21A8" },
  { body: "#FACC15", head: "#F59E0B", dark: "#B45309", pattern: "#B45309" },
  { body: "#06B6D4", head: "#0891B2", dark: "#155E75", pattern: "#155E75" },
];

const DOT_POSITIONS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[30, 28], [70, 72]],
  3: [[30, 28], [50, 50], [70, 72]],
  4: [[30, 28], [70, 28], [30, 72], [70, 72]],
  5: [[30, 28], [70, 28], [50, 50], [30, 72], [70, 72]],
  6: [[30, 24], [70, 24], [30, 50], [70, 50], [30, 76], [70, 76]],
};

type Pt = { x: number; y: number };

function squareToCenter(sq: number, CELL: number): Pt {
  const idx = sq - 1;
  const rawRow = Math.floor(idx / GRID);
  const rawCol = idx % GRID;
  const row = GRID - 1 - rawRow;
  const col = rawRow % 2 === 0 ? rawCol : GRID - 1 - rawCol;
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

function bezierPoint(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
  };
}

function bezierTangent(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const mt = 1 - t;
  return {
    x: 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
}

function snakeCurve(headSq: number, tailSq: number, idx: number, CELL: number) {
  const s = squareToCenter(headSq, CELL);
  const e = squareToCenter(tailSq, CELL);
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

type DiceFaceProps = { face: number | null; size: number };

function DiceFace({ face, size }: DiceFaceProps) {
  const dots = face ? DOT_POSITIONS[face] || [] : [];
  const dotR = size * 0.085;
  return (
    <View style={{
      width: size, height: size, borderRadius: size * 0.24,
      backgroundColor: "#FFFFFF", borderWidth: 1.5, borderColor: "#C9B8FF",
      justifyContent: "center", alignItems: "center",
      elevation: 4, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 3,
      shadowOffset: { width: 0, height: 2 },
    }}>
      {dots.length === 0 && <Text style={{ fontSize: size * 0.42, color: "#9A93C4", fontWeight: "900" }}>?</Text>}
      {dots.map(([x, y], i) => (
        <View key={i} style={{
          position: "absolute", left: `${x}%` as any, top: `${y}%` as any,
          width: dotR * 2, height: dotR * 2, borderRadius: dotR,
          backgroundColor: "#312E81",
          transform: [{ translateX: -dotR }, { translateY: -dotR }],
        }} />
      ))}
    </View>
  );
}

type Props = {
  matchId: string;
  userId: string;
  players?: PlayerContext[];
  myName: string;
  myAvatar: string | null;
  onComplete: (result: HtmlGameResult) => void;
  // Game state (from SnakeLadderRuntime)
  status: "connecting" | "waiting" | "active" | "finished";
  state: any;
  isMyTurn: boolean;
  toast: string | null;
  rolling: boolean;
  remoteRolling: string | null;
  lastDice: number | null;
  dicePreview: number | null;
  lastLanded: number | null;
  playerInfo: Record<string, { name: string; username?: string; avatar?: string }>;
  autoRoll: null | { remaining: number; target: string; phase: "countdown" | "rolling" };
  chatPopups: Array<{ id: number; uid: string; name: string; text: string; color: string }>;
  kbH: number;
  kbLift: number;
  tokenAnims: Record<string, { x: Animated.Value; y: Animated.Value }>;
  getOrCreateTokenAnim: (uid: string, sq: number) => { x: Animated.Value; y: Animated.Value };
  diceRotate: Animated.Value;
  diceAnim: Animated.Value;
  toastAnim: Animated.Value;
  turnPulse: Animated.Value;
  rollDice: () => boolean;

  showToast: (msg: string) => void;
};

export default function SnakeLadderGame({
  matchId, userId, players, myName, myAvatar, onComplete,
  status, state, isMyTurn, toast, rolling, remoteRolling,
  lastDice, dicePreview, lastLanded, playerInfo, autoRoll,
  chatPopups,
  kbH, kbLift, tokenAnims, getOrCreateTokenAnim,
  diceRotate, diceAnim, toastAnim, turnPulse,
  rollDice, showToast,
}: Props) {
  // The game renders at its natural size and is uniformly scaled down when
  // the container shrinks. Everything shrinks together — board, cards, buttons.
  const NATURAL_W = SCREEN_W;
  const NATURAL_H = SCREEN_H - 60; // minus GamesScreen header
  const { onLayout, scale } = useGameContainer({ naturalWidth: NATURAL_W, naturalHeight: NATURAL_H, paddingX: 16 });
  const BOARD_SIZE = Math.min(Math.floor(SCREEN_W - 24), 400, Math.floor(SCREEN_H - 340));
  const CELL = BOARD_SIZE / GRID;
  const [helpOpen, setHelpOpen] = useState(false);
  const chatScroll = useRef<ScrollView>(null);

  const pName = useCallback((uid: string): string => {
    const p = players?.find((x) => x.id === uid) || playerInfo[uid];
    return uid === userId ? "You" : p?.name || p?.username || "Player";
  }, [userId, players, playerInfo]);

  const turnOrder = state?.turnOrder || [];
  const currentTurnIdx = state?.currentTurnIndex ?? 0;
  const currentUid = turnOrder[currentTurnIdx];
  const CARD_GAP = 6;
  const CARD_W = Math.min(80, (SCREEN_W - 28 - CARD_GAP * 4) / 5);
  const pulseScale = turnPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const TOKEN_SIZE = CELL * 0.52;
  const TOKEN_POINT = TOKEN_SIZE * 0.45;
  const TOKEN_H = TOKEN_SIZE + TOKEN_POINT * 0.4;

  const chatCardCenterX = useCallback((uid: string): number | null => {
    const idx = turnOrder.indexOf(uid);
    if (idx < 0) return null;
    const n = turnOrder.length;
    const diceIdx = n >= 3 ? 2 : n === 2 ? 1 : 0;
    const slot = idx + (diceIdx < idx ? 1 : 0) + (diceIdx === idx ? 1 : 0);
    const totalW = (n + 1) * CARD_W + n * CARD_GAP;
    return 14 + (SCREEN_W - 28 - totalW) / 2 + slot * (CARD_W + CARD_GAP) + CARD_W / 2;
  }, [turnOrder, CARD_W]);

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
      let numColor = "rgba(255,255,255,0.78)";
      if (sq === 100) bg = "#F59E0B";
      else if (isSnakeHead) { bg = SNAKE_CELL; numColor = "rgba(255,255,255,0.9)"; }
      else if (isLadderBase) { bg = LADDER_CELL; numColor = "rgba(255,255,255,0.9)"; }
      const dest = isSnakeHead ? SNAKES[sq] : isLadderBase ? LADDERS[sq] : null;
      cells.push(
        <View key={sq} style={{
          position: "absolute", left: col * CELL, top: row * CELL,
          width: CELL, height: CELL, backgroundColor: bg,
          borderWidth: isLanding ? 2 : 0.5,
          borderColor: isLanding ? "#FBBF24" : "rgba(255,255,255,0.08)",
          justifyContent: "center", alignItems: "center",
          zIndex: isLanding ? 2 : 0,
        }}>
          {sq === 100 ? (
            <Text style={{ fontSize: 15 }}>👑</Text>
          ) : (
            <>
              <Text style={{ fontSize: 10, color: numColor, fontWeight: "800" }}>{sq}</Text>
              {dest != null && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 1, marginTop: 1 }}>
                  <Text style={{ fontSize: 6.5, color: "#FFF", fontWeight: "900" }}>{isSnakeHead ? "▼" : "▲"}</Text>
                  <Text style={{ fontSize: 6.5, color: "#FFF", fontWeight: "800", opacity: 0.95 }}>{dest}</Text>
                </View>
              )}
            </>
          )}
        </View>,
      );
    }
    return cells;
  }, [lastLanded]);

  const svgOverlays = useMemo(() => {
    const ladderElements: React.ReactElement[] = [];
    const snakeElements: React.ReactElement[] = [];

    Object.entries(LADDERS).forEach(([startStr, end]) => {
      const start = Number(startStr);
      const s = squareToCenter(start, CELL);
      const e = squareToCenter(end, CELL);
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
      const rungs: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
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
          {rungs.map((r, i) => (
            <Line key={`shn-${i}`} x1={(r.x1 + r.x2) / 2} y1={(r.y1 + r.y2) / 2}
              x2={(r.x1 + r.x2) / 2 + 1.5} y2={(r.y1 + r.y2) / 2 + 1.5}
              stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" strokeLinecap="round" />
          ))}
          <Circle cx={e.x} cy={e.y} r={5} fill="#FDE68A" opacity={0.9} />
          <Circle cx={e.x} cy={e.y} r={2.5} fill="#FFF" opacity={0.95} />
          <Circle cx={s.x} cy={s.y} r={4} fill="#D97706" opacity={0.85} />
        </G>,
      );
    });

    Object.entries(SNAKES).forEach(([startStr, end], idx) => {
      const start = Number(startStr);
      const { s, e, p1, p2, d } = snakeCurve(start, end, idx, CELL);
      const tan0 = bezierTangent(s, p1, p2, e, 0);
      const headDeg = Math.round(Math.atan2(tan0.y, tan0.x) * 180 / Math.PI);
      const st = SNAKE_STYLES[idx % SNAKE_STYLES.length];
      const samples: { x: number; y: number; a: number }[] = [];
      const NS = 12;
      for (let i = 1; i <= NS; i++) {
        const t = 0.07 + (i / NS) * 0.85;
        const p = bezierPoint(s, p1, p2, e, t);
        const tan = bezierTangent(s, p1, p2, e, t);
        samples.push({ x: p.x, y: p.y, a: Math.atan2(tan.y, tan.x) * 180 / Math.PI });
      }
      const tailPts = [1, 0.965, 0.93].map((t) => bezierPoint(s, p1, p2, e, t));
      snakeElements.push(
        <G key={`snake-${start}`}>
          <Path d={d} stroke="rgba(0,0,0,0.35)" strokeWidth="13" fill="none"
            strokeLinecap="round" strokeLinejoin="round" transform="translate(1.5,1.5)" />
          <Path d={d} stroke={st.body} strokeWidth="10" fill="none"
            strokeLinecap="round" strokeLinejoin="round" />
          <Path d={d} stroke="rgba(255,255,255,0.35)" strokeWidth="3.5" fill="none"
            strokeLinecap="round" strokeDasharray="2,10" />
          {samples.map((p, i) => {
            const r = i % 2 === 0 ? 3.2 : 2.2;
            const rad = (p.a * Math.PI) / 180;
            const pts = [0, 90, 180, 270].map((deg) => {
              const a = rad + (deg * Math.PI) / 180;
              return `${(p.x + Math.cos(a) * r).toFixed(1)},${(p.y + Math.sin(a) * r).toFixed(1)}`;
            }).join(" ");
            return <Polygon key={`pat-${i}`} points={pts} fill={st.pattern} opacity={0.5} />;
          })}
          {tailPts.map((p, i) => (
            <Circle key={`tail-${i}`} cx={p.x} cy={p.y} r={4.2 - i * 1.2} fill={st.dark} />
          ))}
          <G transform={`translate(${s.x} ${s.y}) rotate(${headDeg})`}>
            <Ellipse cx={CELL * 0.18} cy={CELL * 0.04} rx={CELL * 0.4} ry={CELL * 0.3} fill="rgba(0,0,0,0.28)" />
            <Ellipse cx={CELL * 0.16} cy={0} rx={CELL * 0.38} ry={CELL * 0.3} fill={st.head} />
            <Ellipse cx={CELL * 0.16} cy={0} rx={CELL * 0.38} ry={CELL * 0.3} fill="none" stroke={st.dark} strokeWidth={2} />
            <Ellipse cx={CELL * 0.13} cy={-CELL * 0.12} rx={CELL * 0.24} ry={CELL * 0.1} fill="rgba(255,255,255,0.28)" />
            <Ellipse cx={CELL * 0.15} cy={CELL * 0.15} rx={CELL * 0.24} ry={CELL * 0.11} fill="rgba(255,255,255,0.22)" />
            <Path d={`M ${-CELL * 0.14} ${-CELL * 0.22} Q ${CELL * 0.02} ${-CELL * 0.38} ${CELL * 0.2} ${-CELL * 0.26}`}
              stroke={st.dark} strokeWidth={CELL * 0.12} fill="none" strokeLinecap="round" opacity={0.7} />
            <Ellipse cx={CELL * 0.44} cy={0} rx={CELL * 0.14} ry={CELL * 0.11} fill={st.head} />
            <Circle cx={CELL * 0.24} cy={-CELL * 0.14} r={CELL * 0.09} fill="#FFF" />
            <Circle cx={CELL * 0.24} cy={CELL * 0.14} r={CELL * 0.09} fill="#FFF" />
            <Circle cx={CELL * 0.27} cy={-CELL * 0.14} r={CELL * 0.048} fill="#1E1B2E" />
            <Circle cx={CELL * 0.27} cy={CELL * 0.14} r={CELL * 0.048} fill="#1E1B2E" />
            <Circle cx={CELL * 0.29} cy={-CELL * 0.17} r={CELL * 0.018} fill="#FFF" />
            <Circle cx={CELL * 0.29} cy={CELL * 0.11} r={CELL * 0.018} fill="#FFF" />
            <Circle cx={CELL * 0.52} cy={-CELL * 0.035} r={CELL * 0.02} fill={st.dark} />
            <Circle cx={CELL * 0.52} cy={CELL * 0.035} r={CELL * 0.02} fill={st.dark} />
            <Path d={`M ${CELL * 0.56} 0 C ${CELL * 0.64} ${-CELL * 0.05} ${CELL * 0.7} ${-CELL * 0.09} ${CELL * 0.76} ${-CELL * 0.15} M ${CELL * 0.56} 0 C ${CELL * 0.64} ${CELL * 0.05} ${CELL * 0.7} ${CELL * 0.09} ${CELL * 0.76} ${CELL * 0.15}`}
              stroke="#EF4444" strokeWidth={CELL * 0.055} fill="none" strokeLinecap="round" />
            <Path d={`M ${CELL * 0.3} ${CELL * 0.1} Q ${CELL * 0.42} ${CELL * 0.14} ${CELL * 0.5} ${CELL * 0.05}`}
              stroke={st.dark} strokeWidth={1.4} fill="none" strokeLinecap="round" opacity={0.55} />
          </G>
        </G>,
      );
    });

    return { ladderElements, snakeElements };
  }, []);

  const renderTokens = () => {
    if (!state?.positions) return null;
    const activeIdx = state.currentTurnIndex ?? 0;
    return Object.entries(state.positions).map(([uid, pos]: [string, any], i) => {
      const sq = pos > 0 ? pos : 1;
      const anim = getOrCreateTokenAnim(uid, sq);
      const isMe = uid === userId;
      const orderIdx = turnOrder.indexOf(uid);
      const color = PLAYER_COLORS[(orderIdx >= 0 ? orderIdx : i) % PLAYER_COLORS.length];
      const info = players?.find((p) => p.id === uid) || playerInfo[uid] || { name: "Player" };
      const avatarUri = isMe ? (info.avatar || myAvatar) : info.avatar;
      const hasAvatar = !!avatarUri;
      const safeIdx = orderIdx >= 0 ? orderIdx : i;
      const isActive = activeIdx === orderIdx;
      const spreadX = (safeIdx % 2) * 8 - 4;
      const spreadY = Math.floor(safeIdx / 2) * 8 - 4 + (sq >= 91 ? 6 : 0);

      return (
        <Animated.View
          key={`tok-${uid}`}
          style={{
            position: "absolute", width: TOKEN_SIZE, height: TOKEN_H,
            left: Animated.subtract(anim.x, TOKEN_SIZE / 2),
            top: Animated.subtract(anim.y, TOKEN_H),
            zIndex: isActive ? 40 : isMe ? 30 : 10 + i,
          }}
        >
          <View style={{ transform: [{ translateX: spreadX }, { translateY: spreadY }] }}>
            <View style={{
              width: TOKEN_SIZE, height: TOKEN_SIZE, borderRadius: TOKEN_SIZE / 2,
              backgroundColor: color,
              borderWidth: isActive ? 2.5 : 2, borderColor: isActive ? "#FDE68A" : "#FFF",
              justifyContent: "center", alignItems: "center", overflow: "hidden",
              elevation: 6, shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 3,
              shadowOffset: { width: 0, height: 2 },
            }}>
              {hasAvatar ? (
                <Image source={{ uri: avatarUri }} style={{ width: TOKEN_SIZE - 5, height: TOKEN_SIZE - 5, borderRadius: (TOKEN_SIZE - 5) / 2 }} />
              ) : (
                <Text style={{ fontSize: TOKEN_SIZE * 0.44, fontWeight: "900", color: "#FFF" }}>
                  {(info.name || "P").charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <View style={{
              alignSelf: "center", width: TOKEN_POINT, height: TOKEN_POINT,
              borderRadius: 3, backgroundColor: color,
              transform: [{ rotate: "45deg" }], marginTop: -TOKEN_POINT * 0.3,
              borderWidth: 1.5, borderColor: "#FFF",
            }} />
          </View>
        </Animated.View>
      );
    });
  };

  const diceFace = (rolling || !!remoteRolling) ? dicePreview : lastDice;

  const renderPinCard = (uid: string, i: number) => {
    const info = players?.find((p) => p.id === uid) || playerInfo[uid] || { name: "Player" };
    const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
    const dark = PLAYER_DARK[i % PLAYER_DARK.length];
    const pos = state?.positions?.[uid] ?? 0;
    const isActive = i === currentTurnIdx;
    const isMe = uid === userId;
    const name = isMe ? (info.name || myName || "You") : (info.name || info.username || `P${i + 1}`);
    const avatar = isMe && !info.avatar ? myAvatar : info.avatar;
    return (
      <Animated.View key={`card-${uid}`} style={[styles.pinCard, { width: CARD_W }, isActive && { transform: [{ scale: pulseScale }] }]}>
        <View style={[styles.pinBody, { backgroundColor: color }, isActive && styles.pinBodyActive]}>
          <View style={styles.pinAvatar}>
            {avatar ? <Image source={{ uri: avatar }} style={styles.pinAvatarImg} /> :
              <Text style={styles.pinAvatarText}>{(name || "?").charAt(0).toUpperCase()}</Text>}
          </View>
          <Text style={styles.pinName} numberOfLines={1}>{name}</Text>
          <View style={[styles.pinScore, { backgroundColor: dark }]}>
            <Text style={styles.pinScoreText}>{pos > 0 ? pos : 0}</Text>
          </View>
          {isActive && (
            <View style={[styles.pinTurnBadge, { backgroundColor: dark }]}>
              <Text style={styles.pinTurnText}>{isMe ? "YOUR TURN" : "TURN"}</Text>
            </View>
          )}
        </View>
        <View style={[styles.pinPoint, { backgroundColor: color }]} />
      </Animated.View>
    );
  };

  const renderDiceCard = () => {
    const text = rolling ? "Rolling…" : remoteRolling ? `${pName(remoteRolling)} is rolling…` :
      isMyTurn ? "Roll the dice" : currentUid ? `${pName(currentUid)}'s turn` : "Roll the dice";
    const spin = diceRotate.interpolate({ inputRange: [-1, 0, 1], outputRange: ["-15deg", "0deg", "15deg"] });
    return (
      <TouchableOpacity key="dice-card" style={[styles.pinCard, { width: CARD_W }]} activeOpacity={0.8}
        disabled={!isMyTurn || rolling} onPress={rollDice}>
        <View style={[styles.pinBody, styles.diceCardBody, isMyTurn && !rolling && styles.diceCardBodyActive]}>
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

  const rollBtnLabel = rolling ? "Rolling…" : autoRoll
    ? autoRoll.phase === "countdown" ? `⏰ Auto-roll in ${autoRoll.remaining}s` : "⏰ Auto-rolling…"
    : isMyTurn ? "Roll Dice" : "Waiting…";

  if (status === "connecting") {
    return (
      <LinearGradient colors={["#150B2E", "#2E1065"]} style={styles.fullCenter}>
        <LogoMark size={72} />
        <Text style={styles.splashTitle}>SNAKES & LADDERS</Text>
        <Text style={styles.splashSub}>Connecting to match…</Text>
        <LoadingDots />
      </LinearGradient>
    );
  }

  if (status === "waiting") {
    return (
      <LinearGradient colors={["#150B2E", "#2E1065"]} style={styles.fullCenter}>
        <LogoMark size={72} />
        <Text style={styles.splashTitle}>SNAKES & LADDERS</Text>
        <Text style={styles.splashSub}>Waiting for players…</Text>
        <LoadingDots />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#150B2E", "#2B1157", "#3B1D7A"]} style={styles.container} onLayout={onLayout}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={SCREEN_W} height={SCREEN_H} style={StyleSheet.absoluteFill}>
          <Path d={`M ${-40} ${SCREEN_H * 0.85} C ${SCREEN_W * 0.3} ${SCREEN_H * 0.5} ${SCREEN_W * 0.2} ${SCREEN_H * 0.35} ${SCREEN_W * 0.8} ${SCREEN_H * 0.12}`}
            stroke="#A78BFA" strokeWidth={30} fill="none" strokeLinecap="round" opacity={0.05} />
          <Line x1={SCREEN_W * 0.02} y1={SCREEN_H * 0.2} x2={SCREEN_W * 0.1} y2={SCREEN_H * 0.02}
            stroke="#FBBF24" strokeWidth={10} strokeLinecap="round" opacity={0.05} />
        </Svg>
      </View>

      {/* Scale entire game as one unit */}
      <View style={{ width: NATURAL_W, height: NATURAL_H, transform: [{ scale }], alignSelf: "center" }}>
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

      <View style={styles.playerRow}>
        {renderCards()}
        {chatPopups.map((pop) => (
          <ChatBubble key={pop.id} pop={pop} cardCenterX={chatCardCenterX(pop.uid)}
            onDone={() => {}} />
        ))}
      </View>

      <View style={[styles.boardWrapper, { width: BOARD_SIZE + 16, height: BOARD_SIZE + 16 }]}>
        <LinearGradient colors={["rgba(124,58,237,0.55)", "rgba(236,72,153,0.22)"]}
          style={[styles.boardGlow, { width: BOARD_SIZE + 16, height: BOARD_SIZE + 16 }]} />
        <View style={[styles.board, { width: BOARD_SIZE, height: BOARD_SIZE }]}>
          {boardCells}
          <Svg height={BOARD_SIZE} width={BOARD_SIZE} style={{ position: "absolute", top: 0, left: 0, zIndex: 3 }}>
            <Defs>
              <SvgGrad id="ladderWood" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#FDE68A" stopOpacity={1} />
                <Stop offset="0.5" stopColor="#D97706" stopOpacity={1} />
                <Stop offset="1" stopColor="#92400E" stopOpacity={1} />
              </SvgGrad>
            </Defs>
            {svgOverlays.ladderElements}
            {svgOverlays.snakeElements}
          </Svg>
          {renderTokens()}
        </View>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={[styles.rollBtn, (!isMyTurn || rolling) && styles.rollBtnDisabled]}
          onPress={rollDice} disabled={!isMyTurn || rolling} activeOpacity={0.85}>
          <LinearGradient colors={isMyTurn && !rolling ? ["#FBBF24", "#F97316"] : ["#3F3A63", "#312C54"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.rollBtnGrad}>
            <DiceFace face={diceFace} size={20} />
            <Text style={[styles.rollBtnText, (!isMyTurn || rolling) && { color: "#8B86B5" }]} numberOfLines={1}>
              {rollBtnLabel}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {toast && (
        <Animated.View style={[styles.toast, {
          opacity: toastAnim,
          transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
        }]}>
          <LinearGradient colors={["#2E1065", "#4C1D95"]} style={styles.toastInner}>
            <Text style={styles.toastText}>{toast}</Text>
          </LinearGradient>
        </Animated.View>
      )}
      </View>


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
            <Text style={styles.helpLine}>💬 Use the Chat button for a quick chit-chat.</Text>
            <TouchableOpacity style={styles.helpClose} onPress={() => setHelpOpen(false)}>
              <Text style={styles.helpCloseText}>Got it!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

function LogoMark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Line x1={52} y1={58} x2={57} y2={6} stroke="#B45309" strokeWidth={5} strokeLinecap="round" />
      <Line x1={61} y1={58} x2={56} y2={6} stroke="#B45309" strokeWidth={5} strokeLinecap="round" />
      <Line x1={53.6} y1={44} x2={59.4} y2={44} stroke="#B45309" strokeWidth={4} strokeLinecap="round" />
      <Line x1={54.8} y1={28} x2={58.4} y2={28} stroke="#B45309" strokeWidth={4} strokeLinecap="round" />
      <Path d="M 12 50 C 26 44 14 34 28 30 C 40 26 26 14 38 10" stroke="#22C55E" strokeWidth={9} fill="none" strokeLinecap="round" />
      <Circle cx={38} cy={10} r={6.5} fill="#16A34A" />
      <Circle cx={39.4} cy={7.6} r={2} fill="#FFF" />
      <Circle cx={39.4} cy={12.4} r={2} fill="#FFF" />
      <Circle cx={40.2} cy={7.2} r={0.9} fill="#1E1B2E" />
      <Circle cx={40.2} cy={12.8} r={0.9} fill="#1E1B2E" />
      <SvgText x={22} y={40} fontSize={30} fontWeight="900" fill="#FBBF24" textAnchor="middle">S</SvgText>
    </Svg>
  );
}

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
  }, []);
  if (cardCenterX == null) return null;
  return (
    <Animated.View pointerEvents="none" style={{
      position: "absolute", top: -40, left: cardCenterX - 54, width: 108, opacity: anim,
      transform: [
        { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
        { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
      ],
    }}>
      <View style={{
        backgroundColor: pop.color, borderRadius: 10,
        paddingHorizontal: 8, paddingVertical: 4, alignItems: "center",
        borderWidth: 1.5, borderColor: "#FFF",
        shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 }, elevation: 9,
      }}>
        <Text style={{ color: "#FFF", fontSize: 8.5, fontWeight: "900", opacity: 0.92 }} numberOfLines={1}>{pop.name}</Text>
        <Text style={{ color: "#FFF", fontSize: 11, fontWeight: "700" }} numberOfLines={2}>{pop.text}</Text>
      </View>
      <View style={{
        alignSelf: "center", width: 10, height: 10, marginTop: -5,
        backgroundColor: pop.color, transform: [{ rotate: "45deg" }],
        borderRightWidth: 1.5, borderBottomWidth: 1.5, borderColor: "#FFF",
      }} />
    </Animated.View>
  );
}

function LoadingDots() {
  return (
    <View style={{ flexDirection: "row", gap: 8, marginTop: 24 }}>
      {[0, 1, 2].map((i) => <PulseDot key={i} delay={i * 200} />)}
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
  return <Animated.View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#A78BFA", opacity: anim }} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", paddingTop: 4, paddingBottom: 10 },
  fullCenter: { flex: 1, justifyContent: "center", alignItems: "center" },
  splashTitle: { fontSize: 26, fontWeight: "900", color: "#F8FAFC", marginTop: 10, letterSpacing: 1 },
  splashSub: { fontSize: 14, color: "#A78BFA", marginTop: 6, fontWeight: "600" },
  topBar: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, marginTop: 2 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 4, padding: 4 },
  logoText: { fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  logoSnakes: { color: "#FBBF24" },
  logoAmp: { color: "#C4B5FD" },
  logoLadders: { color: "#818CF8" },
  playerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", gap: 6, marginTop: 8, paddingHorizontal: 14 },
  pinCard: { alignItems: "center" },
  pinBody: { width: "100%", borderRadius: 14, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, alignItems: "center", paddingTop: 7, paddingBottom: 8, elevation: 4, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  pinBodyActive: { borderWidth: 2, borderColor: "#FFE9A8", elevation: 8, shadowOpacity: 0.5 },
  pinAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.95)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.95)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  pinAvatarImg: { width: 32, height: 32, borderRadius: 16 },
  pinAvatarText: { fontSize: 15, fontWeight: "900", color: "#4C1D95" },
  pinName: { marginTop: 3, fontSize: 9, fontWeight: "800", color: "#FFF", maxWidth: "92%", textAlign: "center" },
  pinScore: { marginTop: 4, minWidth: 22, height: 15, borderRadius: 8, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  pinScoreText: { fontSize: 10, fontWeight: "900", color: "#FFF" },
  pinTurnBadge: { position: "absolute", top: -6, right: -6, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 7 },
  pinTurnText: { fontSize: 6, fontWeight: "900", color: "#FFF", letterSpacing: 0.4 },
  pinPoint: { width: 14, height: 14, borderRadius: 3, transform: [{ rotate: "45deg" }], marginTop: -7 },
  diceCardBody: { backgroundColor: "#6D28D9", justifyContent: "center", paddingTop: 8 },
  diceCardBodyActive: { borderWidth: 2, borderColor: "#FDE68A" },
  diceCardText: { marginTop: 6, fontSize: 8.5, fontWeight: "800", color: "#FFF", textAlign: "center", paddingHorizontal: 2 },
  diceCardPoint: { backgroundColor: "#6D28D9" },
  boardWrapper: { position: "relative", justifyContent: "center", alignItems: "center", marginTop: 10 },
  boardGlow: { position: "absolute", borderRadius: 20, opacity: 0.85 },
  board: { position: "relative", backgroundColor: "#1C194E", borderRadius: 16, overflow: "hidden", borderWidth: 3, borderColor: "#FBBF24", elevation: 18, shadowColor: "#A855F7", shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 5 } },
  controls: { flexDirection: "row", alignItems: "center", marginTop: 12, gap: 10, paddingHorizontal: 14, width: "100%" },
  chatBtn: { height: 54, paddingHorizontal: 20, borderRadius: 27, backgroundColor: "#6D28D9", borderWidth: 1.5, borderColor: "rgba(196,181,253,0.35)", flexDirection: "row", alignItems: "center", gap: 7, elevation: 6, shadowColor: "#A855F7", shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  chatBtnText: { color: "#FFF", fontSize: 15, fontWeight: "900" },
  rollBtn: { flex: 1, borderRadius: 27, overflow: "hidden", elevation: 8, shadowColor: "#F59E0B", shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
  rollBtnDisabled: { opacity: 0.55, shadowOpacity: 0 },
  rollBtnGrad: { height: 54, borderRadius: 27, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  rollBtnText: { color: "#431407", fontSize: 16, fontWeight: "900", letterSpacing: 0.5 },
  toast: { position: "absolute", bottom: 86, alignSelf: "center", borderRadius: 24, overflow: "hidden", elevation: 16, zIndex: 90 },
  toastInner: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, borderWidth: 1.5, borderColor: "rgba(196,181,253,0.4)" },
  toastText: { color: "#F8FAFC", fontSize: 15, fontWeight: "900" },
  chatWrap: { flex: 1, justifyContent: "flex-end" },
  chatDismiss: { flex: 1 },
  chatSheet: { backgroundColor: "#1B0F3E", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: "rgba(124,58,237,0.45)", paddingHorizontal: 14, paddingTop: 12, paddingBottom: Platform.OS === "ios" ? 26 : 14, maxHeight: "72%" },
  chatHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  chatTitle: { flex: 1, fontSize: 16, fontWeight: "900", color: "#F3F0FF" },
  chatLiveTag: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9, backgroundColor: "rgba(34,197,94,0.18)" },
  chatLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22C55E" },
  chatLiveText: { fontSize: 9, fontWeight: "800", color: "#4ADE80", letterSpacing: 0.5 },
  chatList: { flexGrow: 0, maxHeight: 260, marginTop: 4 },
  chatListContent: { paddingBottom: 8 },
  chatEmpty: { color: "#8B84B8", fontSize: 13, textAlign: "center", marginTop: 30, fontWeight: "600" },
  chatMsg: { marginBottom: 10 },
  chatMsgMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
  chatMsgName: { fontSize: 11, fontWeight: "900" },
  chatMsgTime: { fontSize: 9, color: "#6E68A0" },
  chatBubble: { alignSelf: "flex-start", maxWidth: "88%", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, borderTopLeftRadius: 4, borderLeftWidth: 3, paddingHorizontal: 11, paddingVertical: 7 },
  chatMsgText: { color: "#EFEBFF", fontSize: 13, lineHeight: 18 },
  chatEmojiRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, paddingHorizontal: 2 },
  chatEmoji: { fontSize: 20 },
  chatInputRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  chatInput: { flex: 1, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.09)", borderWidth: 1, borderColor: "rgba(196,181,253,0.25)", paddingHorizontal: 16, color: "#FFF", fontSize: 14 },
  chatSend: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center" },
  chatSendDisabled: { opacity: 0.4 },
  helpWrap: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 30 },
  helpDismiss: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  helpCard: { width: "100%", maxWidth: 340, backgroundColor: "#1E1044", borderRadius: 22, borderWidth: 1.5, borderColor: "rgba(124,58,237,0.5)", padding: 22, elevation: 14 },
  helpHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  helpTitle: { fontSize: 18, fontWeight: "900", color: "#F8FAFC" },
  helpLine: { color: "#D6CFF2", fontSize: 13.5, lineHeight: 21, marginBottom: 8 },
  helpClose: { marginTop: 14, height: 46, borderRadius: 23, backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center" },
  helpCloseText: { color: "#FFF", fontSize: 15, fontWeight: "900" },
});
