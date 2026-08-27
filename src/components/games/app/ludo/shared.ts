/**
 * Ludo shared constants, board geometry, helpers, and types.
 * Imported by LudoGame, LudoRuntime, and every sub-component.
 */

import { Dimensions } from "react-native";

// ── Timing constants ─────────────────────────────────────────────────────────
export const DICE_ROLL_MS = 1600;
export const STEP_MS = 210;
export const ENTRY_MS = 250;
export const CAPTURE_BUDGET_MS = 1900;
export const CAPTURE_BEAT_MS = 160;
export const CAPTURE_WAIT_MS = 3200;
export const TURN_GAP_MS = 2000;
export const MOVE_WINDOW_MS = 30 * 1000;
export const TURN_REVEAL_MAX_MS = 2600;
export const CAPTURE_SEQ_EXTRA_MS = 2400;
export const NO_MOVE_HOLD_MS = 1400;

// ── Layout ───────────────────────────────────────────────────────────────────
export const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
export const BOARD_SIZE = Math.min(
  Math.floor(SCREEN_W - 20),
  Math.floor(SCREEN_H * 0.66),
);
export const CELL = BOARD_SIZE / 15;
export const CHAT_MAX_H = Math.max(196, Math.floor(SCREEN_H * 0.26));
export const CORNER_STRIP = 92;

// ── Colors ───────────────────────────────────────────────────────────────────
export const PLAYER_COLORS = ["#E32636", "#009E60", "#FFC000", "#007FFF"] as const;
export const PLAYER_COLORS_D = ["#9D1313", "#006B40", "#CC9900", "#0055AA"] as const;
export const PLAYER_COLORS_L = ["#F7757F", "#3FC997", "#FFE066", "#55A8FF"] as const;

export const BG_TOP = "#0A2472";
export const BG_BOTTOM = "#050D3A";

// ── Corner positions (matches board quadrants) ───────────────────────────────
export const CORNER_POS: Record<
  number,
  { align: "left" | "right"; vert: "top" | "bottom" }
> = {
  0: { align: "left", vert: "top" },
  1: { align: "right", vert: "top" },
  2: { align: "right", vert: "bottom" },
  3: { align: "left", vert: "bottom" },
};

// ── Static identity values for non-animating coins ───────────────────────────
import { Animated } from "react-native";
export const GIGGLE_IDENTITY = new Animated.Value(1);
export const TURN_GIGGLE_IDENTITY = new Animated.Value(0);

// ── Board path (15×15 grid) ──────────────────────────────────────────────────
// 52-cell shared loop + 5-cell home column + finish = 58 positions total.
export const LUDO_PATH: [number, number][] = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  [7, 0], [8, 0],
  [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  [14, 7], [14, 8],
  [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  [7, 14], [6, 14],
  [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  [0, 7], [0, 6],
];

// Safe cells (4 starts + 4 stars)
export const SAFE_CELLS = new Set([
  "1,6", "8,1", "13,8", "6,13", "6,2", "12,6", "8,12", "2,8",
]);

// Home yard slot positions (col, row)
export const HOME_SLOTS: [number, number][][] = [
  [[2, 2], [4, 2], [2, 4], [4, 4]],       // Red TL
  [[11, 2], [13, 2], [11, 4], [13, 4]],    // Green TR
  [[11, 11], [13, 11], [11, 13], [13, 13]], // Yellow BR
  [[2, 11], [4, 11], [2, 13], [4, 13]],    // Blue BL
];

// Per-player exclusive home columns (pos 52→56)
export const HOME_COLS: [number, number][][] = [
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],       // red → right
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],       // green → down
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],   // yellow → left
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],   // blue → up
];

// Finished coin resting spots (centre triangle)
export const HOME_SPOTS: [number, number][] = [
  [7.0, 7.5], // red
  [7.5, 7.0], // green
  [8.0, 7.5], // yellow
  [7.5, 8.0], // blue
];

export const PLAYER_PATH_OFFSET = [0, 13, 26, 39];

// ── Coin stacking ────────────────────────────────────────────────────────────
const STACK_FAN: Record<number, [number, number][]> = {
  2: [[-0.17, -0.17], [0.17, 0.17]],
  3: [[0, -0.2], [-0.18, 0.16], [0.18, 0.16]],
  4: [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]],
};

export function stackOffset(rank: number, count: number): { x: number; y: number } {
  if (count <= 1) return { x: 0, y: 0 };
  const fan = STACK_FAN[count];
  if (fan) return { x: fan[rank][0], y: fan[rank][1] };
  if (rank === 0) return { x: 0, y: 0 };
  const ang = rank * 2.39996;
  const r = 0.24 + 0.04 * (rank - 1);
  return { x: r * Math.cos(ang), y: r * Math.sin(ang) };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
export function seededStars(count: number, seed = 42) {
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483647;
    return s / 2147483647;
  };
  return Array.from({ length: count }, () => ({
    x: rnd() * 100,
    y: rnd() * 100,
    r: 0.8 + rnd() * 1.6,
    o: 0.25 + rnd() * 0.5,
  }));
}

export function getTokenPos(
  pi: number,
  tokenId: number,
  pos: number,
  cell: number,
): { x: number; y: number } {
  if (pos === -1) {
    const [col, row] = HOME_SLOTS[pi % 4][tokenId % 4];
    return { x: col * cell, y: row * cell };
  }
  if (pos === 57) {
    const [hx, hy] = HOME_SPOTS[pi % 4];
    const ox = tokenId % 2 === 0 ? -0.28 : 0.28;
    const oy = tokenId < 2 ? -0.28 : 0.28;
    return { x: (hx + ox) * cell, y: (hy + oy) * cell };
  }
  if (pos >= 52) {
    const [col, row] = HOME_COLS[pi % 4][Math.min(56, pos) - 52];
    return { x: (col + 0.5) * cell, y: (row + 0.5) * cell };
  }
  const idx = (PLAYER_PATH_OFFSET[pi % 4] + pos) % LUDO_PATH.length;
  const [col, row] = LUDO_PATH[idx];
  return { x: (col + 0.5) * cell, y: (row + 0.5) * cell };
}

export function starPts(
  cx: number,
  cy: number,
  r1: number,
  r2: number,
  n: number,
): string {
  return Array.from({ length: n * 2 }, (_, i) => {
    const a = (Math.PI / n) * i - Math.PI / 2;
    const r = i % 2 === 0 ? r1 : r2;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

// ── Socket helpers ───────────────────────────────────────────────────────────
export const EVENTS = {
  READY: "READY",
  MOVE: "MOVE",
  CONNECT_ACK: "CONNECT",
  START: "START",
  SYNC: "SYNC",
  GAME_OVER: "GAME_OVER",
  ERROR: "ERROR",
  CHAT: "CHAT",
};

export function extractEnginePlayers(data: any): any[] {
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

export function buildPlayerInfo(
  players: any[],
): Record<string, { name: string; username?: string; avatar?: string; level?: number }> {
  const info: Record<string, { name: string; username?: string; avatar?: string; level?: number }> = {};
  players.forEach((p: any) => {
    const uid = p.id || p.userId;
    if (uid) {
      info[uid] = {
        name: p.displayName || p.name || p.username || "Player",
        username: p.username,
        avatar: p.avatar || p.avatarUrl,
        level:
          p.level ??
          (typeof p.xp === "number" ? Math.floor(p.xp / 1000) + 1 : undefined),
      };
    }
  });
  return info;
}

// ── Types ────────────────────────────────────────────────────────────────────
export type ChatMsg = {
  id: number;
  uid?: string;
  name: string;
  color: string;
  text: string;
  time: string;
};
