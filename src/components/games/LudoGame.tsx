import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Image,
  TextInput,
  ScrollView,
  Platform,
  Keyboard,
  Easing,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Svg, {
  Polygon,
  Circle,
  Defs,
  LinearGradient as SvgGrad,
  Stop,
  Rect,
  Path,
} from "react-native-svg";
import type { HtmlGameResult } from "../../games/types";
import { createGameEngineSocket } from "../../services/socketClient";
import { gameSound, useTurnSound } from "../../services/gameSound";

// Backstop hold for remote rolls: the tumble (~1.2s) clears the rolling state
// itself when the die settles; this timer only catches rolls that arrived
// while another tumble was already running.
const DICE_ROLL_MS = 1600;

// ── Constants ─────────────────────────────────────────────────────────────────
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
// Initial board size — the live size is measured from layout so the board
// always fills the available space (production responsiveness). No small cap:
// the board grows with the screen and shrinks only when the chat panel opens.
const BOARD_SIZE = Math.min(
  Math.floor(SCREEN_W - 20),
  Math.floor(SCREEN_H * 0.66),
);
const CELL = BOARD_SIZE / 15;
// The chat panel is a compact bottom bar (~20–26% of the screen, with a
// usability floor). It never swallows the board: the message list scrolls
// inside it, so even with the keyboard open (~40%) the board stays visible.
const CHAT_MAX_H = Math.max(196, Math.floor(SCREEN_H * 0.26));
// How long a roll that can't move stays on screen before the turn passes,
// so players see what was rolled and why the die moves to the next player.
const NO_MOVE_HOLD_MS = 1400;
// Vertical gutters reserved around the board for the corner profile cards and
// the die, so they never cover the play area on any screen size. The board is
// sized to fit between these strips (top cards + die, bottom cards + die or
// the open chat panel).
const CORNER_STRIP = 92;

// Token movement pacing — coins walk the track cell by cell with a tick per
// hop; captured coins run fast backwards along the track to their yard.
const STEP_MS = 210; // forward hop per cell (leisurely walk)
const ENTRY_MS = 250; // pop from the yard onto the start cell
const CAPTURE_BUDGET_MS = 1900; // total reverse-run budget when captured
// Capture pacing — tunable beat + wait. The beat is the pause at the capture
// cell after the capturer lands before the captured coin runs home; the wait
// is how long a deferred retreat may hold for the capturer's walk before it
// starts anyway (ceiling for cancelled/re-seated capturer walks).
const CAPTURE_BEAT_MS = 160;
const CAPTURE_WAIT_MS = 3200;
// Uniform post-move beat before the next turn is revealed — applied to bots
// AND humans alike so every turn transition reads "roll → move → 2s → next"
// edge to edge (captures, extra turns on 6, home entries included).
const TURN_GAP_MS = 2000;
// Post-roll window to tap a token — shown as a live countdown under the die
// for every roll (manual or auto-rolled). The client auto-moves just before
// the window ends so it always beats the server's 30s turn-timeout backstop.
const MOVE_WINDOW_MS = 30 * 1000;
// Ceiling for revealing a pending turn change. Normally the turn is revealed
// the moment the last coin walk finishes; this backstop forces the reveal if a
// walk was cancelled mid-flight (e.g. a board re-layout) and its completion
// never fired. Covers the longest possible move (capture retreat ~1.9s) with
// margin.
const TURN_REVEAL_MAX_MS = 2600;
// Extra reveal-fallback headroom when a capture is sequenced (capturer walk
// + beat + retreat can run ~2s past a plain move's budget).
const CAPTURE_SEQ_EXTRA_MS = 2400;

// Reference-style backdrop
const BG_TOP = "#0A2472";
const BG_BOTTOM = "#050D3A";

// Corner position for each player index (matches the board quadrants)
// TL = Red(0), TR = Green(1), BR = Yellow(2), BL = Blue(3)
const CORNER_POS: Record<
  number,
  { align: "left" | "right"; vert: "top" | "bottom" }
> = {
  0: { align: "left", vert: "top" },
  1: { align: "right", vert: "top" },
  2: { align: "right", vert: "bottom" },
  3: { align: "left", vert: "bottom" },
};

// Deterministic pseudo-random stars for the backdrop
function seededStars(count: number, seed = 42) {
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

const PLAYER_COLORS = ["#E32636", "#009E60", "#FFC000", "#007FFF"] as const;
const PLAYER_COLORS_D = ["#9D1313", "#006B40", "#CC9900", "#0055AA"] as const;
const PLAYER_COLORS_L = ["#F7757F", "#3FC997", "#FFE066", "#55A8FF"] as const;
// Static identity values used for coins that aren't animating (the giggle
// wrappers need a stable Animated.Value, never a per-render allocation).
const GIGGLE_IDENTITY = new Animated.Value(1);
const TURN_GIGGLE_IDENTITY = new Animated.Value(0);

// ── Board path (15×15 grid) ───────────────────────────────────────────────────
// The SHARED loop is 52 cells (13 per player — starts at 0/13/26/39). The four
// home columns are NOT part of the loop: each player's coins turn into their
// own colored column (positions 52–56) and finish in their center triangle
// (position 57). This keeps every player's coins off the other colors' home
// columns.
const LUDO_PATH: [number, number][] = [
  [1, 6],
  [2, 6],
  [3, 6],
  [4, 6],
  [5, 6],
  [6, 5],
  [6, 4],
  [6, 3],
  [6, 2],
  [6, 1],
  [6, 0],
  [7, 0],
  [8, 0],
  [8, 1],
  [8, 2],
  [8, 3],
  [8, 4],
  [8, 5],
  [9, 6],
  [10, 6],
  [11, 6],
  [12, 6],
  [13, 6],
  [14, 6],
  [14, 7],
  [14, 8],
  [13, 8],
  [12, 8],
  [11, 8],
  [10, 8],
  [9, 8],
  [8, 9],
  [8, 10],
  [8, 11],
  [8, 12],
  [8, 13],
  [8, 14],
  [7, 14],
  [6, 14],
  [6, 13],
  [6, 12],
  [6, 11],
  [6, 10],
  [6, 9],
  [5, 8],
  [4, 8],
  [3, 8],
  [2, 8],
  [1, 8],
  [0, 8],
  [0, 7],
  [0, 6],
];

// Starts + Stars
const SAFE_CELLS = new Set([
  "1,6",
  "8,1",
  "13,8",
  "6,13",
  "6,2",
  "12,6",
  "8,12",
  "2,8",
]);

// Slot positions inside each home yard (col, row)
const HOME_SLOTS: [number, number][][] = [
  [
    [2, 2],
    [4, 2],
    [2, 4],
    [4, 4],
  ], // Red TL
  [
    [11, 2],
    [13, 2],
    [11, 4],
    [13, 4],
  ], // Green TR
  [
    [11, 11],
    [13, 11],
    [11, 13],
    [13, 13],
  ], // Yellow BR
  [
    [2, 11],
    [4, 11],
    [2, 13],
    [4, 13],
  ], // Blue BL
];

// Each player's exclusive home column (positions 52→56), moving toward the
// center. Coins of other colors never render on these cells.
const HOME_COLS: [number, number][][] = [
  [
    [1, 7],
    [2, 7],
    [3, 7],
    [4, 7],
    [5, 7],
  ], // red → right
  [
    [7, 1],
    [7, 2],
    [7, 3],
    [7, 4],
    [7, 5],
  ], // green → down
  [
    [13, 7],
    [12, 7],
    [11, 7],
    [10, 7],
    [9, 7],
  ], // yellow → left
  [
    [7, 13],
    [7, 12],
    [7, 11],
    [7, 10],
    [7, 9],
  ], // blue → up
];

// Finished coins (pos 57) rest inside their color's center triangle.
const HOME_SPOTS: [number, number][] = [
  [7.0, 7.5], // red (left triangle)
  [7.5, 7.0], // green (top triangle)
  [8.0, 7.5], // yellow (right triangle)
  [7.5, 8.0], // blue (bottom triangle)
];

const PLAYER_PATH_OFFSET = [0, 13, 26, 39];

function getTokenPos(
  pi: number,
  tokenId: number,
  pos: number,
  cell: number,
): { x: number; y: number } {
  // Pin geometry — the coin's DOWN TIP is the placement point. The pin tip
  // renders HEAD_CENTER (PIN_H/3) BELOW the anim anchor, so every anchor is
  // Yard rings, track cells AND home-lane cells all alike, so coins read as pins
  // standing on their spots everywhere (tip on the centre, head above it).
  const PIN_W = Math.max(14, cell * 0.76);
  if (pos === -1) {
    // Yard slot — tip on the ring centre, head rides above it.
    const [col, row] = HOME_SLOTS[pi % 4][tokenId % 4];
    return { x: col * cell, y: row * cell };
  }
  if (pos === 57) {
    // Finished — tip on the centre-triangle spot
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

// ── Coin stacking ─────────────────────────────────────────────────────────────
// When several coins share one spot (same track cell, same yard slot, same
// home-column cell, or the centre triangle) they fan out so every coin stays
// visible instead of hiding underneath the first one. Offsets are in CELL
// units, indexed by stack size then rank within the stack.
const STACK_FAN: Record<number, [number, number][]> = {
  2: [
    [-0.17, -0.17],
    [0.17, 0.17],
  ],
  3: [
    [0, -0.2],
    [-0.18, 0.16],
    [0.18, 0.16],
  ],
  4: [
    [-0.2, -0.2],
    [0.2, -0.2],
    [-0.2, 0.2],
    [0.2, 0.2],
  ],
};

function stackOffset(rank: number, count: number): { x: number; y: number } {
  if (count <= 1) return { x: 0, y: 0 };
  const fan = STACK_FAN[count];
  if (fan) return { x: fan[rank][0], y: fan[rank][1] };
  // 5+ coins — golden-angle spiral so even a big pile keeps every coin visible.
  if (rank === 0) return { x: 0, y: 0 };
  const ang = rank * 2.39996;
  const r = 0.24 + 0.04 * (rank - 1);
  return { x: r * Math.cos(ang), y: r * Math.sin(ang) };
}

// Star polygon helper
function starPts(
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

const EVENTS = {
  READY: "READY",
  MOVE: "MOVE",
  CONNECT_ACK: "CONNECT",
  START: "START",
  SYNC: "SYNC",
  GAME_OVER: "GAME_OVER",
  ERROR: "ERROR",
  CHAT: "CHAT",
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

function buildPlayerInfo(
  players: any[],
): Record<
  string,
  { name: string; username?: string; avatar?: string; level?: number }
> {
  const info: Record<
    string,
    { name: string; username?: string; avatar?: string; level?: number }
  > = {};
  players.forEach((p: any) => {
    const uid = p.id || p.userId;
    if (uid) {
      info[uid] = {
        name: p.displayName || p.name || p.username || "Player",
        username: p.username,
        avatar: p.avatar || p.avatarUrl,
        // Server snapshots carry level directly (bots may omit it); fall back
        // to the app-wide formula from XP if only xp was provided.
        level:
          p.level ??
          (typeof p.xp === "number" ? Math.floor(p.xp / 1000) + 1 : undefined),
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
  level?: number;
};

type Props = {
  matchId: string;
  userId: string;
  wsToken: string;
  players?: PlayerContext[];
  myName?: string;
  myAvatar?: string | null;
  /** My level badge — the snapshot path supplies it on modern matches, but a
      legacy rejoin roster excludes me, so GamesScreen passes it explicitly. */
  myLevel?: number;
  /** Mirrors the GamePlayModal phase — the engine only STARTs once this is
      "playing" (READY is sent after the 3-2-1, never on connect). */
  externalPhase?: "playing" | "waiting";
  onComplete: (result: HtmlGameResult) => void;
};

type ChatMsg = {
  id: number;
  uid?: string;
  name: string;
  color: string;
  text: string;
  time: string;
};

// ── Dot positions for dice faces ──────────────────────────────────────────────
// Fixed star field for the reference-style deep-blue backdrop
const STARS = seededStars(34);

const DOT_POS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72],
  ],
  6: [
    [28, 20],
    [72, 20],
    [28, 50],
    [72, 50],
    [28, 80],
    [72, 80],
  ],
};

export default function LudoGame({
  matchId,
  userId,
  wsToken,
  players,
  myName: myNameProp,
  myAvatar: myAvatarProp,
  myLevel,
  externalPhase = "waiting",
  onComplete,
}: Props) {
  const [socket, setSocket] = useState<any>(null);

  // Responsive board: measured from the available space so the board always
  // fits above the chat panel (and shrinks when the chat opens).
  const [boardSize, setBoardSize] = useState(BOARD_SIZE);
  const cell = boardSize / 15;
  // Chat panel height (measured) — bottom-anchored UI lifts above it.
  const [chatPanelH, setChatPanelH] = useState(0);
  const cellRef = useRef(cell);
  cellRef.current = cell;
  // Measured width of every corner card (measured on mount) — the die anchors
  // beside the active card's measured edge (with a gap), so a long name can
  // never collide with it, even after the turn changes players.
  const cardWidthsRef = useRef<Record<string, number>>({});
  // Snapshotted die anchor used while coin walks are in flight — the die lock
  // logic near the anchor computation keeps the die in place through a mid-walk
  // shrink and re-anchors it beside the shrunken card once the walk completes.
  const dieLockRef = useRef<Record<string, any> | null>(null);
  // Keyboard height (both platforms). iOS overlays the keyboard, so the game
  // content is lifted explicitly by kbH. Android applies adjustResize to the
  // whole window, so this container ALREADY loses kbH of height when the
  // keyboard opens — manually lifting again would double-shift and collapse
  // everything. All bottom-anchored offsets therefore use kbLift below.
  const [kbH, setKbH] = useState(0);
  // The lift actually applied to positions: full on iOS (overlay keyboard),
  // zero on Android (the window already resized).
  const kbLift = Platform.OS === "ios" ? kbH : 0;

  const me = players?.find((p) => p.id === userId);
  const myName = myNameProp || me?.name || "You";
  const myAvatar = myAvatarProp || me?.avatar || null;
  const [status, setStatus] = useState<
    "connecting" | "waiting" | "active" | "finished"
  >("connecting");
  const [gameState, setGameState] = useState<any>(null);
  const [myPlayerIdx, setMyPlayerIdx] = useState(0);
  // Capture impact bursts — an expanding player-colored shockwave that plays
  // at the capture cell the moment the capturer lands (before the captured
  // coin runs home), so captures read as a real event.
  const [bursts, setBursts] = useState<
    Array<{ id: number; x: number; y: number; color: string }>
  >([]);
  const burstIdRef = useRef(0);
  // ── Turn-reveal gate ───────────────────────────────────────────────────────
  // The engine advances turns the instant a move is processed, but the token
  // walk animation takes a visible beat. The VISIBLE turn (coin giggle, die
  // anchor, my-turn interactivity) only advances once every in-flight coin
  // animation has settled — the next player never gets their turn while the
  // previous move is still playing out on screen.
  const [displayTurn, setDisplayTurn] = useState(0);
  const activeWalksRef = useRef(0); // in-flight token walks
  // Token keys with a walk currently registered. Drives the walk counter with
  // exact accounting: a walk replaced or cancelled (new SYNC for the same
  // token, board re-seat) is decremented via clearTokenPath, so the counter
  // always returns to 0 instead of leaking.
  const pendingKeysRef = useRef<Set<string>>(new Set());
  // Captured tokens whose retreat home is deferred until the capturing coin
  // finishes walking to the cell — the capture plays out in sequence instead
  // of the captured coin fleeing before the capturer arrives.
  const deferredCapturesRef = useRef<Set<string>>(new Set());
  // Poll timers waiting on a capturing walk; cleared on unmount.
  const capturePollRefs = useRef<ReturnType<typeof setInterval>[]>([]);
  const pendingTurnRef = useRef<number | null>(null); // engine turn awaiting reveal
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMyTurn = displayTurn === myPlayerIdx;
  const [toast, setToast] = useState<string | null>(null);
  // Dice roll animation — visible to every player, not just the roller.
  const [rolling, setRolling] = useState(false);
  const [remoteRolling, setRemoteRolling] = useState<string | null>(null);
  const [dicePreview, setDicePreview] = useState<number | null>(null);
  // The last rolled face latched so it stays visible even when the move SYNC
  // lands right behind the roll (bot matches) and clears dice before the
  // tumble settles — the die shows the rolled result, never a bare idle.
  const [settledFace, setSettledFace] = useState<number | null>(null);
  // A roll that produced no legal move is held on screen so everyone can see
  // what was rolled and why the turn passes before the die moves on. This is
  // what makes no-move turns (bot matches especially) read as human play.
  const [noMoveHold, setNoMoveHold] = useState<{
    playerIdx: number;
    face: number;
  } | null>(null);
  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [chatPopups, setChatPopups] = useState<
    Array<{
      id: number;
      uid: string;
      name: string;
      text: string;
      color: string;
      cornerIdx: number;
    }>
  >([]);
  // How much the open chat panel lifts bottom-anchored UI (corner cards, die,
  // toast, bubbles) so nothing hides behind the panel. Uses the measured panel
  // height once known; falls back to a reasonable estimate on the first frame.
  const chatInset = chatOpen
    ? chatPanelH > 0
      ? chatPanelH
      : Math.min(280, CHAT_MAX_H)
    : 0;

  // Player info from socket (name + avatar + level for opponents)
  const [playerInfo, setPlayerInfo] = useState<
    Record<string, { name: string; avatar?: string; level?: number }>
  >({});

  // Single merged map of player identity (name + avatar + level) so the corner
  // cards always show the real profile pic, name and level badge. Sources,
  // richest first:
  //   1. the matchmaking `players` prop (GamesScreen resolves displayName/avatar
  //      from matchMetadata.playerSnapshots),
  //   2. the engine CONNECT_ACK player snapshots,
  //   3. myName/myAvatar props for the current user.
  const playerMeta = useMemo(() => {
    const map: Record<
      string,
      { name: string; avatar?: string | null; level?: number }
    > = {};
    Object.entries(playerInfo || {}).forEach(([uid, info]: [string, any]) => {
      map[uid] = {
        name: info?.name || info?.username || "Player",
        avatar: info?.avatar || null,
        level: info?.level,
      };
    });
    (players || []).forEach((p) => {
      map[p.id] = {
        name: p.name || p.username || map[p.id]?.name || "Player",
        avatar: p.avatar || map[p.id]?.avatar || null,
        level: p.level ?? map[p.id]?.level,
      };
    });
    map[userId] = {
      name: myName || "You",
      avatar: myAvatar || null,
      level: map[userId]?.level ?? myLevel,
    };
    return map;
  }, [playerInfo, players, userId, myName, myAvatar, myLevel]);

  // Live mirror for the socket listeners (which capture the first-render
  // closure) so chat can resolve real sender names from the corner roster.
  const playerMetaRef = useRef<
    Record<string, { name?: string; avatar?: string | null; level?: number }>
  >({});
  playerMetaRef.current = playerMeta;

  // Dice tumble axes. rotate = spin, lift = bob up/down, shake = horizontal
  // jitter, squash = landing flatten (scaleX widens / scaleY compresses).
  const diceRotate = useRef(new Animated.Value(0)).current;
  const diceLift = useRef(new Animated.Value(0)).current;
  const diceShake = useRef(new Animated.Value(0)).current;
  const diceSquash = useRef(new Animated.Value(0)).current;
  // True while a tumble is running — a second tumble can't start over the
  // same axes, so any roll that lands mid-animation is queued here (mode +
  // callback, last one wins) and played the moment the axes free up — dice
  // animations are never skipped or cut short.
  const tumbleBusyRef = useRef(false);
  // FIFO queue of tumble requests that arrived while the dice axes were
  // mid-roll — every queued roll plays its OWN full animation, in arrival
  // order, as the axes free up. Rapid bot rolls are never skipped or merged.
  const pendingTumblesRef = useRef<
    {
      mode: "own" | "remote" | "pulse";
      rollerId?: string;
      onDone?: () => void;
    }[]
  >([]);
  // Backstop that clears the remote-roll preview if a tumble never plays —
  // re-armed whenever an actual remote tumble starts (see runDiceTumble) so
  // the cycling face survives queue waits and the full animation.
  const remoteRollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Production safety net: if a tumble is interrupted (native-driver animation
  // dropped on app background / teardown) and finish never fires, this frees
  // the axes so the dice system can never wedge and queue rolls forever.
  const tumbleWatchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Dice tumble choreography ─────────────────────────────────────────────
  // A standard 5-phase roll: pick-up → shake → throw → impact-squash → settle.
  //   own    — full choreography after I press roll (~1.3s)
  //   remote — same but a touch quicker, plays when any opponent's roll SYNCs
  //   pulse  — short squash-pop for a no-move pass (result "drops in")
  // Any mode queues behind a running tumble instead of overriding it — a
  // remote roll landing during my own tumble (or my roll during a remote
  // tumble) plays in sequence, so every player's dice animation completes.
  const runDiceTumble = useCallback(
    (opts: {
      mode: "own" | "remote" | "pulse";
      rollerId?: string;
      onDone?: () => void;
    }) => {
      const { mode, rollerId, onDone } = opts;
      // Axes are mid-roll — append this request to the queue; each queued roll
      // plays its own full tumble, in order, as the axes free up.
      if (tumbleBusyRef.current) {
        pendingTumblesRef.current.push({ mode, onDone });
        return;
      }
      // Reset every axis so a stale animation can't bleed into the new one.
      diceLift.setValue(0);
      diceRotate.setValue(0);
      diceShake.setValue(0);
      diceSquash.setValue(0);
      // Mark the axes busy for EVERY mode (including the no-move pulse) so a
      // roll landing mid-animation is queued instead of colliding.
      tumbleBusyRef.current = true;
      // A remote tumble re-establishes the preview the moment it actually
      // starts (directly, or after a queue wait) — the previous queued tumble's
      // onDone cleared remoteRolling, so without this the face would freeze on
      // the latest result instead of cycling. The backstop is also re-armed.
      if (mode === "remote") {
        setRemoteRolling(rollerId ?? "remote");
        if (remoteRollTimer.current) clearTimeout(remoteRollTimer.current);
        remoteRollTimer.current = setTimeout(
          () => setRemoteRolling(null),
          DICE_ROLL_MS,
        );
      }
      // Arm the watchdog: every tumble must complete inside a generous budget
      // or the axes are force-freed so the game can't stall on a dropped frame.
      if (tumbleWatchdog.current) clearTimeout(tumbleWatchdog.current);
      tumbleWatchdog.current = setTimeout(() => {
        tumbleWatchdog.current = null;
        // finish never fired (animation dropped) — free the axes and move on.
        tumbleBusyRef.current = false;
        onDone?.();
        const next = pendingTumblesRef.current.shift();
        if (next) runDiceTumbleRef.current(next);
      }, DICE_ROLL_MS + 800);

      const finish = () => {
        if (tumbleWatchdog.current) {
          clearTimeout(tumbleWatchdog.current);
          tumbleWatchdog.current = null;
        }
        tumbleBusyRef.current = false;
        onDone?.();
        const next = pendingTumblesRef.current.shift();
        if (next) {
          // Another remote roll is waiting — re-arm the backstop across the
          // gap between queued tumbles too, so the preview never drops out
          // mid-sequence.
          if (next.mode === "remote") {
            if (remoteRollTimer.current) clearTimeout(remoteRollTimer.current);
            remoteRollTimer.current = setTimeout(
              () => setRemoteRolling(null),
              DICE_ROLL_MS,
            );
          }
          runDiceTumbleRef.current(next);
        }
      };

      if (mode === "pulse") {
        Animated.sequence([
          Animated.parallel([
            Animated.timing(diceSquash, {
              toValue: 1,
              duration: 90,
              useNativeDriver: true,
            }),
            Animated.timing(diceLift, {
              toValue: 0.55,
              duration: 90,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.spring(diceSquash, {
              toValue: 0,
              speed: 14,
              bounciness: 12,
              useNativeDriver: true,
            }),
            Animated.spring(diceLift, {
              toValue: 0,
              speed: 14,
              bounciness: 12,
              useNativeDriver: true,
            }),
          ]),
        ]).start(finish);
        return;
      }

      const remote = mode === "remote";
      Animated.sequence([
        // 1. Pick-up — the die eases up off the table with a gentle tilt.
        Animated.parallel([
          Animated.timing(diceLift, {
            toValue: 1,
            duration: remote ? 120 : 160,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(diceRotate, {
            toValue: 0.35,
            duration: remote ? 120 : 160,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        // 2. Smooth continuous roll — a SINGLE 360° spin (no direction reversals,
        // so it never jumps) with ease-in-out: it starts slowly, rolls fast in
        // the middle, and glides to a stop. The die sinks back down as it rolls
        // and a tiny rattle fades out during the first part.
        Animated.parallel([
          Animated.timing(diceRotate, {
            toValue: 6,
            duration: remote ? 900 : 1050,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(diceLift, {
            toValue: 0.15,
            duration: remote ? 900 : 1050,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(diceShake, {
              toValue: 1,
              duration: 150,
              useNativeDriver: true,
            }),
            Animated.timing(diceShake, {
              toValue: -0.7,
              duration: 150,
              useNativeDriver: true,
            }),
            Animated.timing(diceShake, {
              toValue: 0.4,
              duration: 150,
              useNativeDriver: true,
            }),
            Animated.timing(diceShake, {
              toValue: 0,
              duration: 350,
              useNativeDriver: true,
            }),
          ]),
        ]),
        // 3. Impact — the die lands and flattens on the table.
        Animated.parallel([
          Animated.timing(diceSquash, {
            toValue: 1,
            duration: 80,
            useNativeDriver: true,
          }),
          Animated.timing(diceLift, {
            toValue: 0,
            duration: 80,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        // 4. Settle — bounce back with a small overshoot.
        Animated.spring(diceSquash, {
          toValue: 0,
          speed: 15,
          bounciness: 10,
          useNativeDriver: true,
        }),
      ]).start(finish);
    },
    [diceLift, diceRotate, diceShake, diceSquash],
  );
  const runDiceTumbleRef = useRef(runDiceTumble);
  runDiceTumbleRef.current = runDiceTumble;
  const toastAnim = useRef(new Animated.Value(0)).current;
  // Dice-roll bookkeeping
  const rollingRef = useRef(false);
  const lastDiceRef = useRef<number | null>(null);
  const settledFaceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // No-move hold: the engine advances the turn with dice=null and the value
  // only in lastDice, so we detect the pass by roundCount staying flat while
  // currentTurnIndex moves on. Refs survive across renders and SYNC storms.
  const noMoveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevRoundRef = useRef<number | null>(null);
  const prevTurnIdxRef = useRef<number | null>(null);
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
  const tokenAnims = useRef<
    Record<string, { x: Animated.Value; y: Animated.Value }>
  >({}).current;

  const getAnim = useCallback((key: string, x: number, y: number) => {
    if (!tokenAnims[key]) {
      tokenAnims[key] = { x: new Animated.Value(x), y: new Animated.Value(y) };
    }
    return tokenAnims[key];
  }, []);

  // ── Walk giggle ────────────────────────────────────────────────────────────
  // Coins pulse with a quick scale bounce ONLY while they're mid-walk — the
  // loop starts when a walk starts and stops when it settles. No glow — the
  // moving coin just hops.
  const giggleVals = useRef<Record<string, Animated.Value>>({}).current;
  const giggleLoops = useRef<Record<string, Animated.CompositeAnimation>>(
    {},
  ).current;
  const startGiggle = useCallback(
    (key: string) => {
      if (giggleLoops[key]) return;
      let g = giggleVals[key];
      if (!g) {
        g = new Animated.Value(1);
        giggleVals[key] = g;
      }
      giggleLoops[key] = Animated.loop(
        Animated.sequence([
          Animated.timing(g, {
            toValue: 1.14,
            duration: 140,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(g, {
            toValue: 1,
            duration: 140,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
      giggleLoops[key].start();
      // Playful hop the moment the coin starts moving — the first walk tick
      // fires on the same frame (delay 0), so the hop lands in sync with it.
      gameSound.playHop();
    },
    [giggleVals, giggleLoops],
  );
  const stopGiggle = useCallback(
    (key: string) => {
      const loop = giggleLoops[key];
      if (loop) {
        loop.stop();
        delete giggleLoops[key];
      }
      const g = giggleVals[key];
      if (g) g.setValue(1);
    },
    [giggleVals, giggleLoops],
  );

  // ── Turn giggle — the active player's coins bounce up and down ─────────────
  // After the dice rotates, the current player's coins gently bob in place
  // (translateY) for as long as their turn is on screen. Pure motion — no glow
  // — so whose turn it is reads from movement alone.
  const turnGiggleVals = useRef<Record<string, Animated.Value>>({}).current;
  const turnGiggleLoops = useRef<Record<string, Animated.CompositeAnimation>>(
    {},
  ).current;
  const startTurnGiggle = useCallback(
    (key: string) => {
      if (turnGiggleLoops[key]) return;
      let v = turnGiggleVals[key];
      if (!v) {
        v = new Animated.Value(0);
        turnGiggleVals[key] = v;
      }
      turnGiggleLoops[key] = Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: -4,
            duration: 160,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: 160,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 3,
            duration: 160,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: 160,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
      turnGiggleLoops[key].start();
    },
    [turnGiggleVals, turnGiggleLoops],
  );
  const stopTurnGiggle = useCallback(
    (key: string) => {
      const loop = turnGiggleLoops[key];
      if (loop) {
        loop.stop();
        delete turnGiggleLoops[key];
      }
      const v = turnGiggleVals[key];
      if (v) v.setValue(0);
    },
    [turnGiggleVals, turnGiggleLoops],
  );

  // Keep the bounce in sync with the visible turn + the SETTLED dice: coins
  // giggle only after the roll has fully played out (the tumble is done —
  // the dice SYNC lands when the tumble STARTS, so gating on dice alone would
  // make coins bounce mid-roll) AND the player has a legal move — and only
  // the coins that can actually be moved, never the whole stack.
  useEffect(() => {
    Object.keys(turnGiggleLoops).forEach((k) => stopTurnGiggle(k));
    if ((gameState?.dice ?? null) === null || rolling || remoteRolling) return;
    const tks = gameState?.tokens ?? {};
    Object.entries(tks).forEach(([uid, list]: [string, any]) => {
      const pi = gameState?.turnOrder?.indexOf(uid) ?? 0;
      if (pi !== displayTurn) return;
      (list || []).forEach((t: any) => {
        if (gameState?.movableTokens?.includes(t.id) ?? true) {
          startTurnGiggle(`${uid}-${t.id}`);
        }
      });
    });
  }, [
    displayTurn,
    gameState,
    rolling,
    remoteRolling,
    startTurnGiggle,
    stopTurnGiggle,
  ]);

  // Last-known position of every token — the previous pos drives the
  // step-by-step walk (and capture reverse-run) on the next SYNC.
  const lastPosRef = useRef<Record<string, number>>({});
  // key → { pi, tokenId } so a walk's completion can re-seat the coin at its
  // exact resting spot (e.g. after a mid-walk board resize) using the latest
  // cell size + stack fan, instead of waiting for the next SYNC.
  const tokenMetaRef: Record<string, { pi: number; tokenId: number }> = useRef<
    Record<string, { pi: number; tokenId: number }>
  >({}).current;
  // In-flight per-token path timers (canceled when a new move overrides).
  const pathTimers = useRef<Record<string, ReturnType<typeof setTimeout>[]>>(
    {},
  ).current;
  // The exact final destination each registered walk is heading to. The
  // walk-completion re-seat compares the recomputed resting spot against THIS
  // (a pure computed-vs-computed check) rather than against the live animated
  // value, so sub-pixel float drift can never fake a resize and fire a visible
  // spring on every capture. Cleared when the walk is cancelled or completes.
  const walkDestRef = useRef<Record<string, { x: number; y: number }>>(
    {},
  ).current;

  // ── Coin stacking helpers ───────────────────────────────────────────────
  // Logical spot key: coins sharing a key share a fan-out slot. Track cells are
  // keyed by the ABSOLUTE loop cell (different players' relative positions can
  // land on the same physical cell), yard slots and home columns are per-player,
  // and finished coins fan inside their own centre triangle.
  const stackKeyOf = useCallback(
    (pi: number, tokenId: number, pos: number): string => {
      if (pos === -1) return `yard:${pi % 4}:${tokenId % 4}`;
      if (pos >= 57) return `center:${pi % 4}`;
      if (pos >= 52) return `home:${pi % 4}:${pos}`;
      return `track:${(PLAYER_PATH_OFFSET[pi % 4] + pos) % LUDO_PATH.length}`;
    },
    [],
  );

  const stackOffsetOf = useCallback(
    (
      pi: number,
      tokenId: number,
      pos: number,
      src?: any,
    ): { x: number; y: number } => {
      const tokens = src?.tokens ?? gameStateRef.current?.tokens;
      if (!tokens) return { x: 0, y: 0 };
      const order = src?.turnOrder ?? gameStateRef.current?.turnOrder ?? [];
      const key = stackKeyOf(pi, tokenId, pos);
      const members: Array<[number, number]> = [];
      Object.entries(tokens).forEach(([uid, tks]: [string, any]) => {
        const p = order.indexOf(uid);
        if (p < 0) return;
        (tks || []).forEach((t: any) => {
          if (stackKeyOf(p, t.id, t.pos ?? -1) === key) members.push([p, t.id]);
        });
      });
      members.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const rank = Math.max(
        0,
        members.findIndex(([p, tid]) => p === pi % 4 && tid === tokenId),
      );
      const off = stackOffset(rank, members.length);
      // Yard rings are roomier (2 cells apart), so their fan can spread wider.
      const scale = pos === -1 ? 1.4 : 1;
      return { x: off.x * scale, y: off.y * scale };
    },
    [stackKeyOf],
  );

  // Render position = base cell spot + the stack fan offset, so stacked coins
  // fan out everywhere (yard, track, home column, centre) and all stay visible.
  // Pass `src` (the incoming SYNC state) while building walk paths so a move
  // lands exactly where the re-seat pass expects it — no post-walk snapping.
  const getTokenRenderPos = useCallback(
    (
      pi: number,
      tokenId: number,
      pos: number,
      src?: any,
    ): { x: number; y: number } => {
      const base = getTokenPos(pi, tokenId, pos, cellRef.current);
      const off = stackOffsetOf(pi, tokenId, pos, src);
      return {
        x: base.x + off.x * cellRef.current,
        y: base.y + off.y * cellRef.current,
      };
    },
    [stackOffsetOf],
  );

  const pathPoint = useCallback(
    (pi: number, tokenId: number, pos: number, src?: any) =>
      getTokenRenderPos(pi, tokenId, pos, src),
    [getTokenRenderPos],
  );

  const clearTokenPath = useCallback(
    (key: string) => {
      (pathTimers[key] || []).forEach(clearTimeout);
      delete pathTimers[key];
      delete walkDestRef[key];
      stopGiggle(key);
      // A pending walk for this key is being cancelled (replaced or re-seated) —
      // its completion will never fire, so release it from the walk gate now.
      if (pendingKeysRef.current.delete(key)) {
        activeWalksRef.current = Math.max(0, activeWalksRef.current - 1);
      }
    },
    [pathTimers, walkDestRef, stopGiggle],
  );

  // Reseat a token with a spring (board resize / re-layout). Also cancels any
  // in-flight step-by-step walk for that token.
  const springToken = useCallback(
    (key: string, x: number, y: number) => {
      clearTokenPath(key);
      const a = tokenAnims[key];
      if (!a) return;
      Animated.parallel([
        Animated.spring(a.x, {
          toValue: x,
          useNativeDriver: false,
          speed: 16,
          bounciness: 8,
        }),
        Animated.spring(a.y, {
          toValue: y,
          useNativeDriver: false,
          speed: 16,
          bounciness: 8,
        }),
      ]).start();
    },
    [clearTokenPath],
  );

  // Walk a token through a list of cell-center points, one hop per stepMs,
  // with a sound played in sync at the start of each hop. The first hop can
  // take its own duration (e.g. the pop out of the yard). Consecutive
  // identical points are collapsed so a home-stretch token doesn't double-hop
  // onto the same spot.
  // ── Turn-reveal helpers ───────────────────────────────────────────────────
  // Actually switch the visible turn (cleared via pendingTurnRef).
  const doReveal = useCallback(() => {
    if (pendingTurnRef.current != null) {
      setDisplayTurn(pendingTurnRef.current);
      pendingTurnRef.current = null;
    }
  }, []);
  // Reveal a pending engine turn once every coin walk has finished. The
  // reveal waits a uniform 2s beat after the last move settles — bots AND
  // humans get the same edge-to-edge pacing (roll → move → 2s → next roll,
  // including captures, extra turns on 6 and home entries). A new move SYNC
  // that arrives during the gap re-arms everything via armTurnRevealFallback
  // (which clears this timer), so the turn can never reveal mid-animation.
  const revealPendingTurn = useCallback(() => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (pendingTurnRef.current == null) return;
    revealTimerRef.current = setTimeout(() => {
      revealTimerRef.current = null;
      doReveal();
    }, TURN_GAP_MS);
  }, [doReveal]);
  const maybeRevealTurn = useCallback(() => {
    if (activeWalksRef.current <= 0) revealPendingTurn();
  }, [revealPendingTurn]);
  // Safety net: a walk cancelled mid-flight (board re-layout, re-seat) never
  // fires its completion, so force the reveal after a fixed ceiling. This path
  // reveals immediately (no gap) — it only fires when a walk was cancelled.
  const armTurnRevealFallback = useCallback(() => {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    // A sequenced capture (capturer walk + beat + retreat) can run longer than
    // a plain move — extend the ceiling so the fallback never reveals the next
    // turn while the captured coin is still running home. The gap is included
    // so the fallback always fires AFTER the normal reveal would have.
    const extra =
      deferredCapturesRef.current.size > 0 ? CAPTURE_SEQ_EXTRA_MS : 0;
    revealTimerRef.current = setTimeout(
      () => {
        revealTimerRef.current = null;
        doReveal();
      },
      TURN_REVEAL_MAX_MS + TURN_GAP_MS + extra,
    );
  }, [doReveal]);

  const runTokenPath = useCallback(
    (
      key: string,
      points: { x: number; y: number }[],
      stepMs: number,
      sound: () => void,
      firstMs = stepMs,
    ) => {
      const a = tokenAnims[key];
      if (!a || points.length < 2) return;
      clearTokenPath(key);
      a.x.stopAnimation();
      a.y.stopAnimation();
      const pts = points.filter(
        (p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y,
      );
      if (pts.length < 2) return;
      // Remember where this walk is headed — the completion re-seat checks the
      // recomputed resting spot against this exact destination.
      walkDestRef[key] = pts[pts.length - 1];
      // Register the walk so the visible turn waits for it. clearTokenPath above
      // already released any previous walk on this key, so this is a fresh count.
      if (!pendingKeysRef.current.has(key)) {
        pendingKeysRef.current.add(key);
        activeWalksRef.current += 1;
      }
      // The coin is moving — start its giggle pulse; it stops on the last hop.
      startGiggle(key);
      const timers: ReturnType<typeof setTimeout>[] = [];
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        const dur = i === 1 ? firstMs : stepMs;
        // Hops start after the previous hop actually finishes, so a longer first
        // hop (entry pop) never gets cut short by the second hop's timer.
        const delay = i === 1 ? 0 : firstMs + (i - 2) * stepMs;
        timers.push(
          setTimeout(() => {
            Animated.parallel([
              Animated.timing(a.x, {
                toValue: p.x,
                duration: dur,
                easing: Easing.linear,
                useNativeDriver: false,
              }),
              Animated.timing(a.y, {
                toValue: p.y,
                duration: dur,
                easing: Easing.linear,
                useNativeDriver: false,
              }),
            ]).start(() => {
              // The last hop completes the walk — free the turn gate + stop the giggle.
              if (i === pts.length - 1 && pendingKeysRef.current.delete(key)) {
                activeWalksRef.current = Math.max(
                  0,
                  activeWalksRef.current - 1,
                );
                stopGiggle(key);
                // The board may have been resized mid-walk (chat/keyboard opened),
                // leaving the coin's path points on the old cell scale. Settle it
                // at its exact resting spot now instead of waiting for a SYNC.
                const meta = tokenMetaRef[key];
                const dest = walkDestRef[key];
                if (meta && dest) {
                  const { x, y } = getTokenRenderPos(
                    meta.pi,
                    meta.tokenId,
                    lastPosRef.current[key] ?? -1,
                  );
                  // Tuned tolerance: a no-resize walk lands EXACTLY on the
                  // destination it was registered with (both points are computed
                  // from the same cell + fan), so the diff is ~0 and nothing
                  // springs on every capture. A real mid-walk resize shifts the
                  // resting spot by several pixels (cell-scaled), far past this
                  // line — spring only then. Smaller drifts are visually
                  // invisible and the next SYNC's stack re-flow catches them.
                  const tol = Math.max(3, cellRef.current * 0.15);
                  if (
                    Math.abs(dest.x - x) > tol ||
                    Math.abs(dest.y - y) > tol
                  ) {
                    springToken(key, x, y);
                  }
                }
                delete walkDestRef[key];
                maybeRevealTurn();
              }
            });
            sound();
          }, delay),
        );
      }
      pathTimers[key] = timers;
    },
    [
      clearTokenPath,
      pathTimers,
      walkDestRef,
      tokenAnims,
      maybeRevealTurn,
      startGiggle,
      stopGiggle,
      getTokenRenderPos,
      springToken,
    ],
  );

  const showToast = (msg: string) => {
    setToast(msg);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(2300),
      Animated.timing(toastAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setToast(null));
  };

  // Spawn a capture-impact burst at a board-space point (pixel coords). The
  // burst self-removes after its ~0.5s animation via the render onDone.
  const spawnBurst = useCallback((x: number, y: number, color: string) => {
    const id = ++burstIdRef.current;
    setBursts((b) => [...b.slice(-5), { id, x, y, color }]); // cap active bursts
  }, []);

  useEffect(() => {
    const s = createGameEngineSocket(matchId, userId, wsToken);
    setSocket(s);

    s.on(EVENTS.CONNECT_ACK, (data: any) => {
      const ps = data.state?.pluginState;
      // Pull the rich lobby snapshots (displayName + avatar) the same way the
      // other games do — the flat players array only carries { userId, color }.
      const players: any[] = extractEnginePlayers(data);
      const idx = players.findIndex(
        (p: any) => p.userId === userId || p.id === userId,
      );
      // The ENGINE turn order is the single source of truth for seating (it
      // drives the board corners, colors and currentTurnIndex). Derive my seat
      // from it first — the snapshot roster may be rotated differently (or
      // stale), and a mismatch would break my-turn detection. Fall back to the
      // snapshot index, then 0, for legacy matches without a turn order.
      const engineSeat = ps?.turnOrder?.indexOf(userId) ?? -1;
      setMyPlayerIdx(engineSeat >= 0 ? engineSeat : idx >= 0 ? idx : 0);

      // Collect player info (name / avatar)
      const info = buildPlayerInfo(players);
      // Inject self — keep the snapshot's level (or the explicit myLevel prop
      // for legacy matches), override name/avatar
      info[userId] = {
        name: myName || "You",
        avatar: myAvatar || undefined,
        level: info[userId]?.level ?? myLevel,
      };
      setPlayerInfo(info);

      // Seed dice bookkeeping so a reconnect mid-turn doesn't fake a remote roll
      if (ps?.dice != null) {
        lastDiceRef.current = ps.dice;
      }
      if (settledFaceTimer.current) {
        clearTimeout(settledFaceTimer.current);
        settledFaceTimer.current = null;
      }
      setSettledFace(ps?.dice ?? null);
      prevRoundRef.current = ps?.roundCount ?? null;
      prevTurnIdxRef.current = ps?.currentTurnIndex ?? null;
      // Seed last-known token positions so a reconnect never replays moves.
      if (ps?.tokens) {
        Object.entries(ps.tokens).forEach(([uid, tks]: [string, any]) => {
          (tks || []).forEach((t: any) => {
            lastPosRef.current[`${uid}-${t.id}`] = t.pos ?? -1;
          });
        });
      }
      if (ps) setGameState(ps);
      // Fresh connection — show the engine's current turn immediately and
      // reset the walk gate (no animations are running yet).
      setDisplayTurn(ps?.currentTurnIndex ?? 0);
      activeWalksRef.current = 0;
      pendingKeysRef.current.clear();
      // Fresh state — drop any deferred capture waits and their poll timers.
      deferredCapturesRef.current.clear();
      capturePollRefs.current.forEach(clearInterval);
      capturePollRefs.current = [];
      pendingTurnRef.current = null;
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
      setStatus(data.state?.status === "ACTIVE" ? "active" : "waiting");
      // Reconnect (or fresh join) — re-arm the READY gate.
      readySentRef.current = false;
      setReadyTick((t) => t + 1);
    });

    s.on(EVENTS.START, (data: any) => {
      const ps = data.state?.pluginState ?? data.state;
      if (ps) setGameState(ps);
      setStatus("active");
    });

    s.on(EVENTS.SYNC, (data: any) => {
      if (!data.state) return;
      const ns = data.state;
      // Animate all tokens — coins walk the track cell by cell with a tick
      // per hop; a captured coin runs fast backwards along the track home.
      // Captures are SEQUENCED below: the capturing coin walks to the cell
      // and settles first, then the captured coin(s) run home.
      const captures: Array<{
        key: string;
        pi: number;
        tokenId: number;
        oldPos: number;
      }> = [];
      if (ns.tokens) {
        Object.entries(ns.tokens).forEach(([uid, tks]: [string, any]) => {
          const pi = ns.turnOrder?.indexOf(uid) ?? 0;
          (tks || []).forEach((t: any) => {
            const key = `${uid}-${t.id}`;
            tokenMetaRef[key] = { pi, tokenId: t.id };
            const newPos = t.pos ?? -1;
            const oldPos = lastPosRef.current[key];
            if (oldPos != null && oldPos !== newPos) {
              if (newPos === -1 && oldPos >= 0) {
                // Captured — defer the reverse run until the capturing coin
                // arrives at this cell (handled after the loop).
                captures.push({ key, pi, tokenId: t.id, oldPos });
              } else if (newPos > oldPos || oldPos === -1) {
                // Normal move — walk from the previous cell to the destination.
                const pts: { x: number; y: number }[] = [];
                if (oldPos === -1) pts.push(pathPoint(pi, t.id, -1, ns)); // pop out of the yard
                for (let p = Math.max(0, oldPos); p <= newPos; p++) {
                  // Entering the home lane (pos 52+): the coin glides straight
                  // from the loop corner (pos 51) into the lane mouth (pos 52)
                  // — a clean diagonal cut at the corner instead of backtracking
                  // over the cell it just crossed. The cut never lands on the
                  // start square (verified per color: the diagonal crosses only
                  // the corner vertex, never the start cell).
                  pts.push(pathPoint(pi, t.id, p, ns));
                }
                runTokenPath(
                  key,
                  pts,
                  STEP_MS,
                  () => gameSound.playTick(),
                  ENTRY_MS,
                );
              } else {
                // Unexpected backward move (engine can't produce one today) —
                // never leave the token silently snapped; spring it into place.
                const { x, y } = pathPoint(pi, t.id, newPos, ns);
                springToken(key, x, y);
              }
            }
            lastPosRef.current[key] = newPos;
          });
        });
      }

      // Sequence the captures: hold each captured coin where it was until the
      // capturing walk lands on its cell, then run it home with a short beat
      // at the capture point so the moment reads clearly. The retreat is
      // registered in the walk gate NOW (deferred), so the visible turn stays
      // locked until both the capturer's walk and the retreat finish.
      captures.forEach((c) => {
        const startRetreat = () => {
          if (!deferredCapturesRef.current.delete(c.key)) return;
          const pts: { x: number; y: number }[] = [];
          for (let p = c.oldPos; p >= 0; p--)
            pts.push(pathPoint(c.pi, c.tokenId, p, ns));
          pts.push(pathPoint(c.pi, c.tokenId, -1, ns));
          const steps = Math.max(1, pts.length - 1);
          const stepMs = Math.max(
            55,
            Math.min(110, Math.floor(CAPTURE_BUDGET_MS / steps)),
          );
          gameSound.playSnake();
          // Long retreats tick sparsely so the sound never rattles.
          const tickEvery = steps > 25 ? 5 : 3;
          let n = 0;
          runTokenPath(c.key, pts, stepMs, () => {
            if (n++ % tickEvery === 0) gameSound.playTick();
          });
        };
        // The capturing coin is the walk headed exactly to the captured cell.
        const capPt = pathPoint(c.pi, c.tokenId, c.oldPos, ns);
        let capturerKey: string | null = null;
        // Tolerance is cell-scaled: only ONE coin walks forward per SYNC (the
        // mover), so a generous radius can't false-positive — it just absorbs
        // stack-fan shifts on the landing cell.
        const capTol = Math.max(4, cellRef.current * 0.5);
        Object.keys(walkDestRef).forEach((k) => {
          if (k === c.key) return;
          const d = walkDestRef[k];
          if (
            d &&
            Math.abs(d.x - capPt.x) < capTol &&
            Math.abs(d.y - capPt.y) < capTol
          )
            capturerKey = k;
        });
        // Hold the walk-gate slot now so the reveal waits for the retreat too.
        // (Guard: if the coin has no anim entry it was never rendered — skip
        // the deferral so the gate can never lock on a phantom token.)
        if (!tokenAnims[c.key]) return;
        deferredCapturesRef.current.add(c.key);
        pendingKeysRef.current.add(c.key);
        activeWalksRef.current += 1;
        if (capturerKey) {
          let waited = 0;
          const iv = setInterval(() => {
            waited += 60;
            // Start the retreat as soon as the capturing walk finishes (its
            // completion removes it from the pending set), with a ceiling so a
            // cancelled/re-seated capturer can never strand the captured coin.
            if (
              !pendingKeysRef.current.has(capturerKey!) ||
              waited > CAPTURE_WAIT_MS
            ) {
              clearInterval(iv);
              // Impact moment: the capturer has landed on the cell — flash the
              // shockwave, then let the captured coin flee after the beat.
              spawnBurst(capPt.x, capPt.y, PLAYER_COLORS[c.pi % 4]);
              const t = setTimeout(startRetreat, CAPTURE_BEAT_MS); // beat at the capture cell
              capturePollRefs.current.push(t as ReturnType<typeof setInterval>);
            }
          }, 60);
          capturePollRefs.current.push(iv);
        } else {
          spawnBurst(capPt.x, capPt.y, PLAYER_COLORS[c.pi % 4]);
          capturePollRefs.current.push(
            setTimeout(startRetreat, CAPTURE_BEAT_MS) as ReturnType<
              typeof setInterval
            >,
          );
        }
      });

      // Re-flow stacks: when a coin moves on/off a shared spot, the remaining
      // coins' fan positions change — spring any token that isn't mid-walk to
      // its updated spot so stacked coins stay fanned out and every one stays
      // visible.
      Object.entries(ns.tokens).forEach(([uid, tks]: [string, any]) => {
        const pi = ns.turnOrder?.indexOf(uid) ?? 0;
        (tks || []).forEach((t: any) => {
          const key = `${uid}-${t.id}`;
          if (pendingKeysRef.current.has(key)) return; // still walking — skip
          const { x, y } = getTokenRenderPos(pi, t.id, t.pos ?? -1, ns);
          const a = tokenAnims[key];
          if (
            a &&
            (Math.abs((a.x as any).__getValue() - x) > 1.5 ||
              Math.abs((a.y as any).__getValue() - y) > 1.5)
          ) {
            springToken(key, x, y);
          }
        });
      });

      // A roll that couldn't move: the engine advances the turn with dice=null
      // (the value only in lastDice). Surface it — hold the result on the
      // roller's corner so players see what was rolled before the turn passes.
      const noMovePass =
        ns.dice === null &&
        ns.lastDice != null &&
        prevRoundRef.current != null &&
        ns.roundCount === prevRoundRef.current &&
        ns.currentTurnIndex !== prevTurnIdxRef.current;
      if (noMovePass) {
        const prevIdx = prevTurnIdxRef.current ?? 0;
        if (noMoveTimer.current) clearTimeout(noMoveTimer.current);
        setNoMoveHold({ playerIdx: prevIdx, face: ns.lastDice });
        noMoveTimer.current = setTimeout(
          () => setNoMoveHold(null),
          NO_MOVE_HOLD_MS,
        );
        // The no-move reveal supersedes any previously held rolled face — the
        // die must not flash a stale result after the reveal clears.
        if (settledFaceTimer.current) {
          clearTimeout(settledFaceTimer.current);
          settledFaceTimer.current = null;
        }
        setSettledFace(null);
        // A short squash-pop so the result "drops in" and reads as a real
        // roll. Skipped when it's my own roll or a tumble is already running —
        // two concurrent sequences over the same axes would fight and stutter.
        if (!rollingRef.current && !tumbleBusyRef.current) {
          runDiceTumble({ mode: "pulse" });
        }
      }

      // Detect a fresh roll so EVERY player sees the tumble + result.
      const newDice = ns.dice ?? null;
      if (newDice !== null && newDice !== lastDiceRef.current) {
        // The next roll supersedes any held no-move result.
        setNoMoveHold(null);
        // Latch the rolled face so it stays visible even when the move SYNC
        // lands right behind the roll (bot matches) and clears dice before the
        // tumble settles.
        setSettledFace(newDice);
        if (settledFaceTimer.current) clearTimeout(settledFaceTimer.current);
        settledFaceTimer.current = setTimeout(() => setSettledFace(null), 2800);
        // Who just rolled? The current turn player is the roller. Every
        // opponent's roll (bots included) must animate — even when my own
        // tumble is still playing, so a roll arriving inside that window is
        // queued by runDiceTumble rather than dropped.
        const order = ns.turnOrder || [];
        const rollerId = order[ns.currentTurnIndex ?? 0];
        const isRemote = rollerId && rollerId !== userId;
        if (isRemote) {
          setRemoteRolling(rollerId);
          setDicePreview(null);
          if (remoteRollTimer.current) clearTimeout(remoteRollTimer.current);
          remoteRollTimer.current = setTimeout(
            () => setRemoteRolling(null),
            DICE_ROLL_MS,
          );
          // Kick off the tumble right away so remote rolls animate too
          // (previously the face only flickered in place). If the dice axes
          // are mid-tumble (my own roll, or a rapid sequence of bot rolls),
          // runDiceTumble queues it and plays it the moment they free up —
          // a remote roll's animation is never skipped, and its roller id is
          // carried through the queue so each tumble re-arms the preview.
          runDiceTumble({
            mode: "remote",
            rollerId,
            onDone: () => {
              if (remoteRollTimer.current)
                clearTimeout(remoteRollTimer.current);
              setRemoteRolling(null);
            },
          });
        }
        // My own roll: rolling stays true until the tumble animation finishes,
        // so the preview keeps cycling and the result lands with the final face.
      }
      lastDiceRef.current = newDice;
      prevRoundRef.current = ns.roundCount ?? null;
      prevTurnIdxRef.current = ns.currentTurnIndex ?? null;
      setGameState(ns);
      // Hold the visible turn until every coin animation from this (and any
      // still-running) move has settled — the next player only gets their turn
      // once the previous move has fully played out on screen.
      const newTurn = ns.currentTurnIndex ?? 0;
      if (activeWalksRef.current > 0) {
        pendingTurnRef.current = newTurn;
        armTurnRevealFallback();
      } else {
        // No walks in flight — reveal immediately. Drop any pending gap reveal
        // (a 2s timer left by an earlier walk completion) so a stale doReveal
        // can never revert the turn after a no-walk SYNC (e.g. a no-move pass).
        if (revealTimerRef.current) {
          clearTimeout(revealTimerRef.current);
          revealTimerRef.current = null;
        }
        pendingTurnRef.current = null;
        setDisplayTurn(newTurn);
      }
    });

    s.on(EVENTS.GAME_OVER, (data: any) => {
      setStatus("finished");
      const won = (data.winner || data.state?.pluginState?.winner) === userId;
      showToast(won ? "🏆 You Won!" : "😢 You Lost");
      // The match is over — release any deferred capture waits (walk-gate
      // slots) and their poll timers so nothing animates or locks the turn
      // reveal after the game ends.
      capturePollRefs.current.forEach(clearInterval);
      capturePollRefs.current = [];
      deferredCapturesRef.current.forEach((k) => {
        if (pendingKeysRef.current.delete(k)) {
          activeWalksRef.current = Math.max(0, activeWalksRef.current - 1);
        }
      });
      deferredCapturesRef.current.clear();
      // The match is over — drop every cached token identity so the map can't
      // grow during long sessions (e.g. replaying matches on the same mount).
      Object.keys(tokenMetaRef).forEach((k) => delete tokenMetaRef[k]);
      setTimeout(() => {
        onComplete({
          score: won ? 1 : 0,
          won,
          xpEarned: won ? 60 : 10,
          durationSeconds: 0,
        });
      }, 2500);
    });

    s.on(EVENTS.ERROR, (e: any) => showToast("⚠️ " + (e.message || "Error")));

    // ── Real multiplayer chat ─────────────────────────────────────────────
    s.on(EVENTS.CHAT, (data: any) => {
      const text = String(data?.text || "").trim();
      if (!text) return;
      const uid = String(data?.userId || "");
      const order = gameStateRef.current?.turnOrder || [];
      const idx = order.indexOf(uid);
      const color = PLAYER_COLORS[(idx >= 0 ? idx : 0) % 4];
      // Real sender name: the server resolves it from the match roster; fall
      // back to the corner-card identity so chat never shows the bare string
      // "Player".
      const rosterName = playerMetaRef.current[uid]?.name;
      const name =
        data?.name ||
        rosterName ||
        (uid === userId ? myName : `Player ${idx + 1}`) ||
        "Player";
      const id = ++msgIdRef.current;
      setMessages((m) => [
        ...m,
        {
          id,
          uid,
          name,
          color,
          text,
          time: new Date(data?.ts || Date.now()).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
      // Pop the message up over the sender's corner card
      setChatPopups((p) => [
        ...p,
        { id, uid, name, color, text, cornerIdx: Math.max(0, idx) },
      ]);
    });

    return () => {
      if (remoteRollTimer.current) clearTimeout(remoteRollTimer.current);
      if (tumbleWatchdog.current) clearTimeout(tumbleWatchdog.current);
      if (noMoveTimer.current) clearTimeout(noMoveTimer.current);
      if (settledFaceTimer.current) clearTimeout(settledFaceTimer.current);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      Object.values(pathTimers).forEach((tl) => tl.forEach(clearTimeout));
      // Cancel any deferred-capture polls still waiting on a walk.
      capturePollRefs.current.forEach(clearInterval);
      capturePollRefs.current = [];
      deferredCapturesRef.current.clear();
      // Stop every walk + turn giggle so no loop keeps ticking after unmount.
      Object.values(giggleLoops).forEach((l) => l.stop());
      Object.keys(giggleLoops).forEach((k) => delete giggleLoops[k]);
      Object.values(turnGiggleLoops).forEach((l) => l.stop());
      Object.keys(turnGiggleLoops).forEach((k) => delete turnGiggleLoops[k]);
      // Board is going away — release the cached token identities too.
      Object.keys(tokenMetaRef).forEach((k) => delete tokenMetaRef[k]);
      s.disconnect();
    };
  }, [matchId, userId, wsToken]);

  // Keyboard lift — the full-screen game Modal doesn't resize with the
  // keyboard (especially on Android), so the whole game is padded up by the
  // keyboard height. This keeps the chat input visible while typing and lets
  // the board compress above it — deterministic on every platform.
  useEffect(() => {
    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvt, (e: any) =>
      setKbH(e?.endCoordinates?.height ?? 0),
    );
    const hide = Keyboard.addListener(hideEvt, () => setKbH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Send READY the moment the board is actually visible (after the 3-2-1).
  useEffect(() => {
    if (externalPhase !== "playing" || readySentRef.current || !socket) return;
    readySentRef.current = true;
    socket.emit(EVENTS.READY);
  }, [externalPhase, socket, readyTick]);

  // When the board is resized (e.g. chat opens and the board compresses),
  // re-seat every token animation so tokens don't sit at stale positions.
  useEffect(() => {
    if (!gameState?.tokens) return;
    Object.entries(gameState.tokens).forEach(([uid, tks]: [string, any]) => {
      const pi = gameState.turnOrder?.indexOf(uid) ?? 0;
      (tks || []).forEach((t: any) => {
        const key = `${uid}-${t.id}`;
        // Never interrupt a coin mid-walk: springing it straight to the
        // destination would make it skip the track cells. Walking coins finish
        // their hops and re-seat on the next SYNC if the scale shifted.
        if (pendingKeysRef.current.has(key)) return;
        const { x, y } = getTokenRenderPos(pi, t.id, t.pos ?? -1);
        if (tokenAnims[key]) springToken(key, x, y);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell, getTokenRenderPos]);

  // Turn-change sound + haptic when it becomes your turn
  useTurnSound(isMyTurn, status === "active");

  const rollDice = useCallback(() => {
    if (!isMyTurn || gameState?.dice !== null || rolling) return;
    rollingRef.current = true;
    setRolling(true);
    socket?.emit(EVENTS.MOVE, { type: "ROLL" });
    gameSound.playTap();

    // Full 5-phase tumble: pick-up → shake → throw → impact → settle. The
    // preview face cycles beneath it and the real result lands via SYNC just
    // as the die settles.
    runDiceTumble({
      mode: "own",
      onDone: () => {
        rollingRef.current = false;
        setRolling(false);
      },
    });
  }, [isMyTurn, gameState, socket, rolling, runDiceTumble]);

  // Cycle the dice preview face while anyone is mid-roll (my roll or remote).
  useEffect(() => {
    if (!rolling && !remoteRolling) return;
    const iv = setInterval(() => {
      setDicePreview(1 + Math.floor(Math.random() * 6));
    }, 110);
    return () => clearInterval(iv);
  }, [rolling, remoteRolling]);

  const moveToken = useCallback(
    (tokenId: number) => {
      // Moves are only legal once the die has rolled AND settled so the player
      // can see the result — never while the tumble is still running.
      if (!isMyTurn || gameState?.dice === null || rolling) return;
      socket?.emit(EVENTS.MOVE, { type: "MOVE_TOKEN", tokenId });
      gameSound.playTap();
    },
    [isMyTurn, gameState, rolling, socket],
  );

  // ── Idle safeguard ────────────────────────────────────────────────────────
  // My turn, nothing pressed: 5s silent grace → 5s visible countdown →
  // auto-roll. Once the die settles, every roll (manual OR auto-rolled) gets a
  // 30s move window — the live countdown is shown under the die itself, and
  // the first movable token is auto-moved just before the window ends. The
  // server's own 30s timeout AUTO-MOVES as a backstop (never skips), so an
  // idle or backgrounded player can never stall the match.
  const [idleLeft, setIdleLeft] = useState<number | null>(null);
  const [moveLeft, setMoveLeft] = useState<number | null>(null);
  const idleTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleMoveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rollDiceRef = useRef<() => void>(() => {});
  const moveTokenRef = useRef<(tokenId: number) => void>(() => {});
  rollDiceRef.current = rollDice;
  moveTokenRef.current = moveToken;

  useEffect(() => {
    const clearMove = () => {
      setMoveLeft(null);
      if (idleMoveRef.current) {
        clearInterval(idleMoveRef.current);
        idleMoveRef.current = null;
      }
    };
    const clearIdle = () => {
      setIdleLeft(null);
      if (idleTickRef.current) {
        clearInterval(idleTickRef.current);
        idleTickRef.current = null;
      }
    };

    if (status !== "active" || !isMyTurn) {
      clearIdle();
      clearMove();
      return;
    }

    if (gameState?.dice != null) {
      // Rolled but nothing tapped. The clock starts the moment the dice SYNC
      // lands — the server restarts its 15s skip on the ROLL, so measuring
      // from the die-settle (tumble ~1.3s later) would auto-move too late and
      // the server skip would win. Auto-move fires at 14s (left hits 1) so the
      // MOVE event reliably beats the 15s server skip. The chip is hidden
      // while the die is mid-tumble (render gate) but the clock never pauses.
      clearIdle();
      if (!idleMoveRef.current) {
        let left = MOVE_WINDOW_MS / 1000; // 15
        setMoveLeft(left);
        idleMoveRef.current = setInterval(() => {
          left -= 1;
          if (left <= 1) {
            if (idleMoveRef.current) {
              clearInterval(idleMoveRef.current);
              idleMoveRef.current = null;
            }
            const st = gameStateRef.current;
            const movable = st?.movableTokens;
            if (
              movable &&
              movable.length > 0 &&
              (st?.currentTurnIndex ?? 0) === myPlayerIdx &&
              st?.dice != null
            ) {
              moveTokenRef.current(movable[0]);
            }
            setMoveLeft(null);
            return;
          }
          setMoveLeft(left);
        }, 1000);
      }
      return clearMove;
    }

    // Waiting for a roll — 5s grace, then a visible 5s countdown, then auto-roll.
    clearMove();
    let seconds = 0;
    setIdleLeft(null);
    if (idleTickRef.current) clearInterval(idleTickRef.current);
    idleTickRef.current = setInterval(() => {
      seconds += 1;
      if (seconds >= 5 && seconds < 10) setIdleLeft(10 - seconds);
      if (seconds >= 10) {
        if (idleTickRef.current) {
          clearInterval(idleTickRef.current);
          idleTickRef.current = null;
        }
        rollDiceRef.current();
      }
    }, 1000);
    return () => {
      clearIdle();
    };
  }, [status, isMyTurn, gameState?.dice, myPlayerIdx]);

  // ── Real multiplayer chat (server broadcasts to the match room) ──────────
  const sendChat = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      // Broadcast to the match room — the server echoes it to every player
      // (including me), and the CHAT listener below renders it for everyone.
      socket?.emit(EVENTS.CHAT, { text: t });
      setDraft("");
      gameSound.playTap();
    },
    [socket],
  );

  // ── Static SVG board (memoized; rebuilds when the board is resized) ──────
  const boardSvg = useMemo(() => {
    const C = cell;
    const S = boardSize;
    const R = Math.max(10, C * 0.55); // outer corner radius
    const elements: React.ReactElement[] = [];

    // Soft white frame
    elements.push(
      <Rect
        key="frame"
        x={0}
        y={0}
        width={S}
        height={S}
        rx={R}
        fill="#FFFFFF"
      />,
    );

    // 1. The 15×15 path grid — rounded cells, hairline separators
    for (let row = 0; row < 15; row++) {
      for (let col = 0; col < 15; col++) {
        const key = `${col},${row}`;
        const isRedH = col < 6 && row < 6;
        const isGreenH = col > 8 && row < 6;
        const isYellH = col > 8 && row > 8;
        const isBlueH = col < 6 && row > 8;
        const isCenter = col >= 6 && col <= 8 && row >= 6 && row <= 8;
        const isYardOrCenter =
          isRedH || isBlueH || isGreenH || isYellH || isCenter;

        const isRedLane = row === 7 && col >= 1 && col <= 5;
        const isGreenLane = col === 7 && row >= 1 && row <= 5;
        const isYellLane = row === 7 && col >= 9 && col <= 13;
        const isBlueLane = col === 7 && row >= 9 && row <= 13;

        // Start cells
        const isRedStart = col === 1 && row === 6;
        const isGreenStart = col === 8 && row === 1;
        const isYellStart = col === 13 && row === 8;
        const isBlueStart = col === 6 && row === 13;

        if (!isYardOrCenter) {
          let fill = "#FFFFFF";
          if (isRedLane || isRedStart) fill = PLAYER_COLORS[0];
          else if (isGreenLane || isGreenStart) fill = PLAYER_COLORS[1];
          else if (isYellLane || isYellStart) fill = PLAYER_COLORS[2];
          else if (isBlueLane || isBlueStart) fill = PLAYER_COLORS[3];

          elements.push(
            <Rect
              key={key}
              x={col * C + 0.5}
              y={row * C + 0.5}
              width={C - 1}
              height={C - 1}
              rx={C * 0.16}
              fill={fill}
              stroke="#D8DEE9"
              strokeWidth={0.6}
            />,
          );

          // Stars for safe squares that are not starts
          if (
            SAFE_CELLS.has(key) &&
            !isRedStart &&
            !isGreenStart &&
            !isYellStart &&
            !isBlueStart
          ) {
            elements.push(
              <Polygon
                key={`s${key}`}
                points={starPts(
                  col * C + C / 2,
                  row * C + C / 2,
                  C * 0.34,
                  C * 0.14,
                  5,
                )}
                fill="none"
                stroke="#94A3B8"
                strokeWidth={1.4}
                strokeLinejoin="round"
              />,
            );
          }

          // Arrows for start cells
          if (isRedStart || isGreenStart || isYellStart || isBlueStart) {
            const cx = col * C + C / 2;
            const cy = row * C + C / 2;
            let pts = "";
            if (isRedStart)
              pts = `${cx - C * 0.2},${cy - C * 0.2} ${cx + C * 0.2},${cy} ${cx - C * 0.2},${cy + C * 0.2}`; // Right arrow
            if (isGreenStart)
              pts = `${cx - C * 0.2},${cy - C * 0.2} ${cx + C * 0.2},${cy - C * 0.2} ${cx},${cy + C * 0.2}`; // Down arrow
            if (isYellStart)
              pts = `${cx + C * 0.2},${cy - C * 0.2} ${cx - C * 0.2},${cy} ${cx + C * 0.2},${cy + C * 0.2}`; // Left arrow
            if (isBlueStart)
              pts = `${cx - C * 0.2},${cy + C * 0.2} ${cx + C * 0.2},${cy + C * 0.2} ${cx},${cy - C * 0.2}`; // Up arrow
            elements.push(
              <Polygon key={`arr${key}`} points={pts} fill="#FFFFFF" />,
            );
          }
        }
      }
    }

    // 2. The four corner yards — rounded color block, white panel, ring slots
    const yards = [
      { x: 0, y: 0, color: PLAYER_COLORS[0] }, // TL Red
      { x: 9 * C, y: 0, color: PLAYER_COLORS[1] }, // TR Green
      { x: 9 * C, y: 9 * C, color: PLAYER_COLORS[2] }, // BR Yellow
      { x: 0, y: 9 * C, color: PLAYER_COLORS[3] }, // BL Blue
    ];

    yards.forEach((yard, i) => {
      // Rounded colored square
      elements.push(
        <Rect
          key={`yBg${i}`}
          x={yard.x}
          y={yard.y}
          width={6 * C}
          height={6 * C}
          rx={C * 0.4}
          fill={yard.color}
        />,
      );
      // Inner white panel with a hairline separation
      elements.push(
        <Rect
          key={`yWh${i}`}
          x={yard.x + C}
          y={yard.y + C}
          width={4 * C}
          height={4 * C}
          rx={C * 0.3}
          fill="#FFFFFF"
          stroke="rgba(15,23,42,0.08)"
          strokeWidth={0.8}
        />,
      );

      // 4 circular home slots for tokens — classic ring + soft center dot
      const slotCenters = [
        { cx: yard.x + 2 * C, cy: yard.y + 2 * C },
        { cx: yard.x + 4 * C, cy: yard.y + 2 * C },
        { cx: yard.x + 2 * C, cy: yard.y + 4 * C },
        { cx: yard.x + 4 * C, cy: yard.y + 4 * C },
      ];
      slotCenters.forEach((pos, j) => {
        // Ring sized snug around the bigger coins — the pin now fills the
        // home ring instead of swimming inside it.
        elements.push(
          <Circle
            key={`slot${i}-${j}`}
            cx={pos.cx}
            cy={pos.cy}
            r={C * 0.64}
            fill="#F1F5F9"
            stroke={yard.color}
            strokeWidth={C * 0.18}
          />,
        );
        elements.push(
          <Circle
            key={`dot${i}-${j}`}
            cx={pos.cx}
            cy={pos.cy}
            r={C * 0.22}
            fill={yard.color}
            opacity={0.35}
          />,
        );
      });
    });

    // 3. Center Triangles with a crisp white seam
    const cx = 7.5 * C,
      cy = 7.5 * C,
      r = 1.5 * C;
    const triangles = [
      {
        pts: `${cx},${cy} ${cx - r},${cy + r} ${cx - r},${cy - r}`,
        color: PLAYER_COLORS[0],
      }, // Left (Red)
      {
        pts: `${cx},${cy} ${cx - r},${cy - r} ${cx + r},${cy - r}`,
        color: PLAYER_COLORS[1],
      }, // Top (Green)
      {
        pts: `${cx},${cy} ${cx + r},${cy - r} ${cx + r},${cy + r}`,
        color: PLAYER_COLORS[2],
      }, // Right (Yellow)
      {
        pts: `${cx},${cy} ${cx - r},${cy + r} ${cx + r},${cy + r}`,
        color: PLAYER_COLORS[3],
      }, // Bottom (Blue)
    ];
    triangles.forEach((t, i) => {
      elements.push(
        <Polygon
          key={`tri${i}`}
          points={t.pts}
          fill={t.color}
          stroke="#FFFFFF"
          strokeWidth={C * 0.12}
          strokeLinejoin="round"
        />,
      );
    });

    return (
      <Svg width={S} height={S} style={StyleSheet.absoluteFill}>
        {elements}
      </Svg>
    );
  }, [cell, boardSize]);

  // ── Token renderer ────────────────────────────────────────────────────────
  const renderTokens = () => {
    if (!gameState?.tokens) return null;
    const elements: React.ReactElement[] = [];

    Object.entries(gameState.tokens).forEach(([uid, tks]: [string, any]) => {
      const pi = gameState.turnOrder?.indexOf(uid) ?? 0;
      const color = PLAYER_COLORS[pi % 4];
      const colorD = PLAYER_COLORS_D[pi % 4];
      const colorL = PLAYER_COLORS_L[pi % 4];
      const isMe = uid === userId;
      // Tappable only after the die settles — the pulse ring appears exactly
      // when the move becomes legal, so there's no hidden race with the tumble.
      const canMovePl = isMyTurn && isMe && gameState.dice !== null && !rolling;
      // Avatar/name resolve from the merged playerMeta (socket snapshots +
      // matchmaking players prop + self), so coins always carry the real face.
      const meta = playerMeta[uid] || {};
      const avatarUri = isMe ? myAvatar || null : meta.avatar || null;

      (tks || []).forEach((token: any, tidx: number) => {
        const tKey = `${uid}-${token.id}`;
        tokenMetaRef[tKey] = { pi, tokenId: token.id };
        const { x, y } = getTokenRenderPos(pi, token.id, token.pos ?? -1);
        const anim = getAnim(tKey, x, y);
        const canMove =
          canMovePl && (gameState.movableTokens?.includes(token.id) ?? true);
        // Reference-style map-pin token: a white gradient pin body (#111 outline)
        // with the player-color head circle and the real profile pic inside.
        // The pin's tip is anchored at the cell center; the head rides above it.
        // Sized so the head circle stays INSIDE its own cell on the track —
        // the head center sits ~0.31·cell above the tip, so a neighboring
        // coin on the cell above is never overlapped (reviewer-flagged).
        const PIN_W = Math.max(14, cell * 0.76);
        const PIN_H = PIN_W * 1.35;
        const HEAD_CENTER = PIN_H / 3; // 45/135 of the pin height
        const HEAD_R = PIN_W * 0.35; // big head — the profile icon reads clearly
        const AV = Math.max(7, PIN_W * 0.7); // 70/100 — fills the enlarged head
        const AV_TOP = HEAD_CENTER - AV / 2;
        const pinBody = (
          <>
            {/* Player-colored pin body (light→dark gradient) with a soft outline —
                the coin is fully the player's color, never white. The head is a
                lighter tint so the avatar pops inside it. */}
            <Svg
              width={PIN_W}
              height={PIN_H}
              viewBox="0 0 100 135"
              style={{ position: "absolute", top: 0, left: 0 }}
            >
              <Defs>
                <SvgGrad
                  id={`pinGrad${uid}${token.id}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <Stop offset="0" stopColor={colorL} />
                  <Stop offset="1" stopColor={colorD} />
                </SvgGrad>
              </Defs>
              {/* Pin body — softened navy outline instead of harsh black. The
                  tail is the classic long pin shape (tip at 132/135 of the
                  SVG height): the coin's DOWN TIP is what sits on the spot
                  centre, so the pin reads as standing on its cell/ring. */}
              <Path
                d="M50 3 C23 3 5 23 5 49 C5 76 26 105 50 132 C74 105 95 76 95 49 C95 23 77 3 50 3 Z"
                fill={`url(#pinGrad${uid}${token.id})`}
                stroke="#232E45"
                strokeWidth="2.5"
              />
              {/* Head circle — lighter tint, soft outline. */}
              <Circle
                cx="50"
                cy="45"
                r="33"
                fill={colorL}
                stroke="#232E45"
                strokeWidth="1.8"
              />
              {/* Subtle top sheen — the whole-coin breathing glow (a soft
                  colored halo that appears while the coin moves) lives outside
                  this SVG so the glow covers the ENTIRE coin, not a dot on its
                  edge. */}
              <Path
                d="M50 4 C34 4 20 11 14 23 C24 13 37 9 50 9 C63 9 76 13 86 23 C80 11 66 4 50 4 Z"
                fill="rgba(255,255,255,0.2)"
              />
            </Svg>

            {/* Profile image — enlarged in the pin head with a soft drop shadow
                so the coin reads as a 3D token, not a flat sticker. The wrapper
                carries the shadow (iOS + Android) around the rounded avatar. */}
            {avatarUri ? (
              <View
                style={{
                  position: "absolute",
                  top: AV_TOP,
                  left: (PIN_W - AV) / 2,
                  width: AV,
                  height: AV,
                  borderRadius: AV / 2,
                  backgroundColor: colorD,
                  shadowColor: "#000",
                  shadowOpacity: 0.5,
                  shadowRadius: 3,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 4,
                }}
              >
                <Image
                  source={{ uri: avatarUri }}
                  style={{
                    width: AV,
                    height: AV,
                    borderRadius: AV / 2,
                    borderWidth: 1.6,
                    borderColor: "#FFF",
                  }}
                />
              </View>
            ) : (
              <View
                style={{
                  position: "absolute",
                  top: AV_TOP,
                  left: (PIN_W - AV) / 2,
                  width: AV,
                  height: AV,
                  borderRadius: AV / 2,
                  backgroundColor: colorD,
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "#000",
                  shadowOpacity: 0.45,
                  shadowRadius: 2.5,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: Math.max(4, AV * 0.42),
                    fontWeight: "900",
                    color: "#FFF",
                  }}
                >
                  {isMe
                    ? myName?.[0] || "Y"
                    : meta.name?.[0] || (pi + 1).toString()}
                </Text>
              </View>
            )}
          </>
        );

        const touchable = (
          <TouchableOpacity
            onPress={() => canMove && moveToken(token.id)}
            activeOpacity={canMove ? 0.7 : 1}
            style={{ width: PIN_W, height: PIN_H, alignItems: "center" }}
          >
            {pinBody}
          </TouchableOpacity>
        );

        // The coin body: the walk giggle (scale pulse) while it moves — no
        // glow anywhere. It starts with the walk and stops when it settles.
        const inner = (
          <Animated.View
            style={{
              transform: [{ scale: giggleVals[tKey] || GIGGLE_IDENTITY }],
            }}
          >
            {touchable}
          </Animated.View>
        );
        // Turn indicator: the active player's MOVABLE coins giggle up and down
        // in place — only after the dice tumble has fully finished (dice set
        // AND no roll in flight) and only the coins that can legally be moved
        // (no dice / no valid move / mid-roll = nothing bounces).
        const turnCanGiggle =
          displayTurn === pi &&
          gameState?.dice !== null &&
          !rolling &&
          !remoteRolling &&
          (gameState.movableTokens?.includes(token.id) ?? true);
        const tokenBody = turnCanGiggle ? (
          <Animated.View
            style={{
              transform: [
                { translateY: turnGiggleVals[tKey] || TURN_GIGGLE_IDENTITY },
              ],
            }}
          >
            {inner}
          </Animated.View>
        ) : (
          inner
        );
        elements.push(
          <Animated.View
            key={tKey}
            style={{
              position: "absolute",
              width: PIN_W,
              height: PIN_H,
              // Visually center the pin in the cell so the top and bottom of the pin
              // sit flush with the top/bottom edges of the grid square.
              left: Animated.add(anim.x, new Animated.Value(-PIN_W / 2)),
              top: Animated.add(anim.y, new Animated.Value(-PIN_H * 0.72)),
              zIndex: canMove ? 30 : isMe ? 20 : 10,
              alignItems: "center",
            }}
          >
            {tokenBody}
          </Animated.View>,
        );
      });
    });
    return elements;
  };

  // Capture-impact shockwaves — rendered above the tokens so the burst plays
  // right on top of the collision. Each burst self-removes after ~0.5s.
  const renderBursts = () => {
    if (bursts.length === 0) return null;
    return bursts.map((b) => (
      <CaptureBurst
        key={b.id}
        burst={b}
        cell={cell}
        onDone={(id) => setBursts((prev) => prev.filter((x) => x.id !== id))}
      />
    ));
  };

  // ── State helpers ─────────────────────────────────────────────────────────
  const face = gameState?.dice ?? null;
  const hasDice = face !== null;
  // Die face shown on everyone's screen: the held no-move result wins, then a
  // tumble preview, then the settled result, then a neutral idle face.
  const diceFace = noMoveHold
    ? noMoveHold.face
    : rolling || remoteRolling
      ? dicePreview
      : hasDice
        ? face
        : settledFace;
  // While a no-move result is held, the die stays beside the roller (the
  // previous player); once released it rides to the VISIBLE turn — which lags
  // the engine's turn until the previous player's coins finish walking.
  const dieAnchorIdx = noMoveHold ? noMoveHold.playerIdx : displayTurn;
  // A tumble is in progress (my roll or anyone's) — the die turns monochrome
  // (black & white) while rolling: every player-color accent (glow halo, idle
  // ring) goes neutral so the colored die only acts as the turn indicator
  // when it's idle and waiting for a roll.
  const rollingNow = rolling || remoteRolling;
  // The die rides with whoever's VISIBLE turn it is — anchored BESIDE that
  // player's corner profile card (left/right of it, never above/below). It
  // stays on the previous player while their coins are still walking. The
  // offset follows the card's MEASURED width + a gap, so a long name can never
  // push the card into the die (fully responsive).
  // When the keyboard is open the die parks in the GAP between the active
  // player's profile card and the board — BELOW a top player's card, ABOVE a
  // bottom player's card, horizontally centred on the card — so it rides with
  // the roller right where they're looking (the old park beside a bottom card
  // hid it far from top players). Keyboard closed: the die rides beside the
  // active player's corner as usual.
  const dieSize = kbH > 0 ? 40 : 56;
  const diePark = dieAnchorIdx;
  const anchorUid = (gameState?.turnOrder || [])[diePark] as string | undefined;
  const dieCardW = Math.min(96, cardWidthsRef.current[anchorUid ?? ""] || 76);
  // Clear separation between the die and the card it rides beside. The card
  // wrapper sits 10px from the screen edge, so anchoring at 10 + dieCardW +
  // dieGap leaves an exact dieGap px of breathing room. The gap stays a
  // little smaller when the keyboard is open (compact cards, tight space).
  const dieGap = kbH > 0 ? 6 : 12;
  // Compact profile cards are ~48px tall while the keyboard is up.
  const COMPACT_CARD_H = 48;
  // While parked the die tucks to the compact card's vertical middle (the
  // card is 48px, the die 42px — 3px off its bottom edge).
  const dieTuck = kbH > 0 ? 3 : 0;
  // Keyboard-open anchors centre the die on the card (left/right inset by the
  // card's half-width minus the die's half-width).
  const dieSide = 10 + dieCardW / 2 - dieSize / 2;
  const DIE_ANCHOR: Record<number, any> = {
    0:
      kbH > 0
        ? { top: 12 + COMPACT_CARD_H + dieGap, left: dieSide } // below the TL card
        : { top: 14, left: 10 + dieCardW + dieGap }, // TL — beside the card
    1:
      kbH > 0
        ? { top: 12 + COMPACT_CARD_H + dieGap, right: dieSide } // below the TR card
        : { top: 14, right: 10 + dieCardW + dieGap }, // TR — beside the card
    // Bottom corners lift above the open chat panel so the die stays visible
    // (while typing, the bottom cards tuck behind the compact chat bar, so
    // the die sits just above the bar).
    2:
      kbH > 0
        ? { bottom: chatInset + kbLift + dieGap, right: dieSide } // above the BR card
        : {
            bottom: 14 + dieTuck + chatInset + kbLift,
            right: 10 + dieCardW + dieGap,
          }, // BR
    3:
      kbH > 0
        ? { bottom: chatInset + kbLift + dieGap, left: dieSide } // above the BL card
        : {
            bottom: 14 + dieTuck + chatInset + kbLift,
            left: 10 + dieCardW + dieGap,
          }, // BL
  };
  const dieAnchor = DIE_ANCHOR[diePark % 4] || DIE_ANCHOR[0];
  // Board margins — keyboard open: the top strip holds the compact cards AND
  // the die (parked below a top card when a top player is active), so it
  // grows to fit both; the bottom strip only needs the compact chat bar
  // (bottom cards ride hidden behind it while typing) plus the die-above-card
  // space when a BOTTOM player is active. Keyboard closed: slim strips, plus
  // the bottom strip grows by the chat panel so the board always sits above
  // the lifted cards. Driven by kbH so ANDROID's natural window resize gets
  // the compact layout too — the old kbLift-only check (iOS) left Android
  // stuck with the full margins and a small board floating in empty space.
  const kbTopFull = 12 + COMPACT_CARD_H + dieGap + dieSize + dieGap;
  const kbTopCardOnly = 12 + COMPACT_CARD_H + dieGap;
  const playerCount = gameState?.turnOrder?.length ?? 4;
  const activeIsTop = diePark < 2;
  const kbTopMargin = activeIsTop ? kbTopFull : kbTopCardOnly;
  // Bottom strip: while typing, the compact chat bar + a small gap; when a
  // BOTTOM player is active their die parks just above the bar, so the strip
  // also fits die + gap.
  const kbBottomMargin =
    playerCount <= 2 || activeIsTop
      ? 8 + chatInset
      : chatInset + dieGap + dieSize + dieGap;

  // ── Die anchor lock ────────────────────────────────────────────────────────
  // Same deferred-resize rule as the token re-seat: while coin walks are in
  // flight the die keeps the anchor it had when the move began, so a mid-walk
  // shrink (keyboard/chat opening) never yanks the die mid-animation. The lock
  // is snapshotted on the first render with an active walk and dropped the
  // moment walks finish — the die then re-anchors beside the shrunken card.
  if (activeWalksRef.current > 0) {
    if (!dieLockRef.current) dieLockRef.current = dieAnchor;
  } else {
    dieLockRef.current = null;
  }
  const dieRenderAnchor = dieLockRef.current || dieAnchor;

  // ── Corner avatar cards (reference-style) ─────────────────────────────────
  const renderCornerCards = () => {
    if (!gameState?.tokens) return null;
    const playerIds = Object.keys(gameState.tokens);
    return (
      <>
        {playerIds.slice(0, 4).map((uid, i) => {
          const pos = CORNER_POS[i];
          if (!pos) return null;
          const isMe = uid === userId;
          const color = PLAYER_COLORS[i % 4];
          const meta = playerMeta[uid] || {};
          const avatarUri = meta.avatar || null;
          // Own card shows the real name with "(You)" so you can spot yourself
          const label = isMe
            ? `${meta.name || myName || "You"} (You)`
            : meta.name || `P${i + 1}`;
          const isActive = displayTurn === i;
          // Compact mode while the keyboard is open — the cards shrink (same
          // layout: avatar on top, badge on its corner, name below) so they
          // fit the strip alongside the parked die. Driven by kbH so Android's
          // natural window resize compacts them too (kbLift is iOS-only — the
          // lift that's actually applied).
          const compact = kbH > 0;
          const cardBody = (
            <View
              pointerEvents="none"
              style={[
                styles.cornerCard,
                compact && styles.cornerCardCompact,
                {
                  // Player-colored border — matches the coin colors across the HUD.
                  borderColor: isActive ? color : `${color}66`,
                  backgroundColor: isActive
                    ? "rgba(6,20,90,0.85)"
                    : "rgba(4,12,56,0.6)",
                },
              ]}
            >
              <View
                style={[
                  styles.cornerAvatarFrame,
                  compact && styles.cornerAvatarFrameCompact,
                  { borderColor: isActive ? color : `${color}66` },
                ]}
              >
                {avatarUri ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={[
                      styles.cornerAvatar,
                      compact && styles.cornerAvatarCompact,
                    ]}
                  />
                ) : (
                  <View
                    style={[
                      styles.cornerAvatarPh,
                      compact && styles.cornerAvatarPhCompact,
                      { backgroundColor: color },
                    ]}
                  >
                    <Text
                      style={[
                        styles.cornerAvatarInitial,
                        compact && styles.cornerAvatarInitialCompact,
                      ]}
                    >
                      {(label || "?")[0].toUpperCase()}
                    </Text>
                  </View>
                )}
                {/* Level badge on the avatar corner — same gold badge as the
                    profile pages, sized for the in-game card. */}
                {meta.level != null && meta.level > 0 && (
                  <LinearGradient
                    colors={["#FFD75E", "#F59E0B"]}
                    style={[
                      styles.cornerLevelBadge,
                      compact && styles.cornerLevelBadgeCompact,
                    ]}
                  >
                    <Text
                      style={[
                        styles.cornerLevelText,
                        compact && styles.cornerLevelTextCompact,
                      ]}
                    >
                      {meta.level}
                    </Text>
                  </LinearGradient>
                )}
              </View>
              {/* Fixed-width box — the name auto-shrinks to fit instead of the
                  box growing/shrinking with the name length. */}
              <Text
                style={[
                  styles.cornerName,
                  compact && styles.cornerNameCompact,
                  { color: isActive ? "#FFF" : "#B9CBF8" },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {label}
              </Text>
            </View>
          );
          return (
            <View
              key={uid}
              style={{
                // The wrapper does ALL the positioning (horizontal + vertical).
                // Cards live in the reserved corner strips, so they never sit
                // over the board; bottom cards lift above the open chat panel.
                position: "absolute",
                [pos.align]: 10,
                // Bottom cards lift above the open chat panel when the
                // keyboard is CLOSED. While the keyboard is up the chat
                // compacts to a slim bar and the cards stay at the bottom,
                // tucking behind it — so the board gets the freed space.
                [pos.vert]:
                  pos.vert === "bottom"
                    ? 12 + (kbH > 0 ? 0 : chatInset) + kbLift
                    : 12,
                zIndex: 70,
                // Sibling-level elevation keeps Android paint order above the
                // board (elevation 20) regardless of zIndex quirks.
                elevation: 30,
              }}
              onLayout={(e: any) => {
                cardWidthsRef.current[uid] = e.nativeEvent.layout.width;
              }}
            >
              {isActive ? (
                <ActiveCardGlow color={color}>{cardBody}</ActiveCardGlow>
              ) : (
                cardBody
              )}
            </View>
          );
        })}
      </>
    );
  };

  // ── Loading screens ───────────────────────────────────────────────────────
  if (status === "connecting" || status === "waiting") {
    return (
      <LinearGradient colors={[BG_TOP, BG_BOTTOM]} style={styles.fullCenter}>
        <Text style={styles.splashEmoji}>
          {status === "connecting" ? "🎲" : "⏳"}
        </Text>
        <Text style={styles.splashTitle}>Ludo Classic</Text>
        <Text style={styles.splashSub}>
          {status === "connecting" ? "Connecting…" : "Waiting for players…"}
        </Text>
        <LoadingDots />
      </LinearGradient>
    );
  }

  // Full tumble range: ±6 units ≈ ±360° so the die completes one smooth
  // rotation (toValue 6 = exactly one full spin back to upright).
  const spin = diceRotate.interpolate({
    inputRange: [-6, 6],
    outputRange: ["-360deg", "360deg"],
  });

  return (
    <LinearGradient
      colors={[BG_TOP, BG_BOTTOM]}
      style={[styles.gameFill, { paddingBottom: 6 + kbLift }]}
    >
      {/* ─ Stars backdrop ─ */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {STARS.map((s, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              left: `${s.x}%` as any,
              top: `${s.y}%` as any,
              width: s.r * 2,
              height: s.r * 2,
              borderRadius: s.r,
              backgroundColor: "#FFFFFF",
              opacity: s.o,
            }}
          />
        ))}
      </View>

      {/* ─ Board — responsive: fills the space between the reserved corner
          strips (profile cards + die) so they never cover the play area ─ */}
      <View
        style={[
          styles.boardWrap,
          {
            // Top strip: TL/TR cards (+ the die, which parks below a top card
            // while the keyboard is up). Bottom strip: the compact chat bar
            // (+ the die above a bottom card in 4P while typing). Keyboard
            // closed the die rides beside the cards, so the strips are slim and
            // the board grows; the bottom strip then adds the chat panel height
            // so the board always sits above the lifted bottom cards.
            marginTop: kbH > 0 ? kbTopMargin : CORNER_STRIP - 6,
            marginBottom:
              kbH > 0 ? kbBottomMargin : CORNER_STRIP - 6 + chatInset,
          },
        ]}
        onLayout={(e) => {
          const { width: w, height: h } = e.nativeEvent.layout;
          // Square board = the smaller dimension of the available space minus a
          // comfortable margin. No small cap — the board fills the space and
          // only compresses when the chat panel (or keyboard) opens. The floor
          // only engages below ~110px of free space (e.g. a legacy 568px-tall
          // phone while typing), so it can never overflow into other UI.
          const next = Math.max(100, Math.min(w - 10, h - 10));
          if (Math.abs(next - boardSize) > 1) setBoardSize(Math.floor(next));
        }}
      >
        <View style={{ width: boardSize, height: boardSize }}>
          {/* Board art — clipped to the rounded corners so the SVG stays clean */}
          <View style={[styles.board, { width: boardSize, height: boardSize }]}>
            {boardSvg}
          </View>
          {/* Tokens + capture bursts — a sibling overlay ABOVE the art and NOT
              clipped, so a pin on a top-edge cell (red's row-0 path, e.g. pos
              6–12) stays fully visible even when its head pokes past the
              board's rounded corner. The corner cards/die sit further out in
              the strips, so nothing overlaps in practice. */}
          {renderTokens()}
          {renderBursts()}
        </View>
      </View>

      {/* ─ Corner avatar cards (like the reference) ─ */}
      {renderCornerCards()}

      {/* Chat bubbles popping over the sender's corner card */}
      {chatPopups.map((pop) => (
        <CornerBubble
          key={pop.id}
          pop={pop}
          cornerIdx={pop.cornerIdx}
          chatInset={chatInset}
          kbH={kbLift}
          onDone={(id) => setChatPopups((p) => p.filter((x) => x.id !== id))}
        />
      ))}

      {/* ─ Die — anchored beside the active player's profile card; while the
          keyboard is open it shrinks and parks between the card and the board
          (below top cards / above bottom cards) ─ */}
      {(() => {
        const dieDot = Math.max(6, dieSize * 0.18);
        return (
          <View style={[styles.dieArea, dieRenderAnchor]}>
            {/* Turn indicator — the dice pulses with the active player's color
            while it's their turn; on the board, the active player's coins
            giggle up and down (no glow). */}
            {/* While a tumble is running the die goes black & white — the glow
            turns a neutral slate so no player color bleeds onto the rolling
            die; the colored turn-glow returns when the die is idle. */}
            <DieGlow
              color={rollingNow ? "#CBD5E1" : PLAYER_COLORS[dieAnchorIdx % 4]}
              size={dieSize}
            />
            <TouchableOpacity
              onPress={rollDice}
              disabled={!isMyTurn || hasDice || rolling}
              activeOpacity={0.85}
            >
              <Animated.View
                style={[
                  styles.dieGlowWrap,
                  {
                    width: dieSize,
                    height: dieSize,
                    borderRadius: dieSize * 0.27,
                    borderWidth: Math.max(2, dieSize * 0.045),
                  },
                  diceFace !== null && styles.dieGlowWrapRolled,
                  // Idle die — ring + glow take the active player's color (HUD
                  // unify). Skipped while a tumble is running so the die stays
                  // strictly black & white for the whole roll.
                  diceFace === null &&
                    !rollingNow && {
                      borderColor: PLAYER_COLORS[dieAnchorIdx % 4],
                      shadowColor: PLAYER_COLORS[dieAnchorIdx % 4],
                    },
                  // Countdown keeps its attention-grabbing white ring (later style wins).
                  (idleLeft !== null ||
                    (moveLeft !== null && moveLeft <= 25 && !rolling)) &&
                    styles.dieGlowWrapCountdown,
                  {
                    transform: [
                      // Lift: the die pops up in the hand / off the table.
                      {
                        translateY: diceLift.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, dieSize * -0.25],
                        }),
                      },
                      // Shake: a subtle horizontal rattle during the roll (kept small
                      // so the motion stays smooth — the spin carries the roll).
                      {
                        translateX: diceShake.interpolate({
                          inputRange: [-1, 1],
                          outputRange: [-2, 2],
                        }),
                      },
                      { rotate: spin },
                      // Squash: flattens on impact, springs back with an overshoot.
                      {
                        scaleX: diceSquash.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1.22],
                        }),
                      },
                      {
                        scaleY: diceSquash.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 0.72],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <LinearGradient
                  colors={
                    idleLeft !== null || diceFace !== null
                      ? ["#FFFFFF", "#F1F5F9"]
                      : ["#FFFFFF", "#E2E8F0"]
                  }
                  style={[
                    styles.dieBody,
                    {
                      width: dieSize,
                      height: dieSize,
                      borderRadius: dieSize * 0.24,
                    },
                  ]}
                >
                  {diceFace !== null ? (
                    (DOT_POS[diceFace] || []).map(([dx, dy], i) => (
                      <View
                        key={i}
                        style={[
                          styles.dot,
                          styles.dotDark,
                          {
                            left: `${dx}%` as any,
                            top: `${dy}%` as any,
                            width: dieDot,
                            height: dieDot,
                            borderRadius: dieDot / 2,
                            transform: [
                              { translateX: -dieDot / 2 },
                              { translateY: -dieDot / 2 },
                            ],
                          },
                        ]}
                      />
                    ))
                  ) : (
                    /* Idle die — a neutral face (never a '?'). A single centred pip
                   reads as "ready to roll" without implying a result. */
                    <View
                      style={[
                        styles.diceIdle,
                        {
                          width: dieSize * 0.46,
                          height: dieSize * 0.46,
                          borderRadius: dieSize * 0.23,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.diceIdlePip,
                          {
                            width: dieSize * 0.16,
                            height: dieSize * 0.16,
                            borderRadius: dieSize * 0.08,
                          },
                        ]}
                      />
                    </View>
                  )}
                </LinearGradient>
                {/* Post-roll move timer — a live countdown pill centered UNDER the
                die (not on its corner). Hidden while the die is mid-tumble and
                during the first 5s of the window — it appears at 25s left so
                the rolled result gets an uncluttered look first. The clock
                itself runs the full 30s from the roll so it stays
                server-accurate; the first movable token auto-moves on expiry. */}
                {moveLeft !== null && moveLeft <= 25 && !rolling && (
                  <View style={styles.dieMoveChip} pointerEvents="none">
                    <View style={styles.dieMoveChipPill}>
                      <Ionicons name="footsteps" size={9} color="#FFF" />
                      <Text style={styles.dieMoveChipText}>{moveLeft}</Text>
                    </View>
                  </View>
                )}
                {/* Pre-roll auto-roll countdown — same pill under the die as the
                move timer (clock icon instead of footsteps), so both timers
                read consistently. */}
                {idleLeft !== null && (
                  <View style={styles.dieMoveChip} pointerEvents="none">
                    <View style={styles.dieMoveChipPill}>
                      <Ionicons name="time-outline" size={9} color="#FFF" />
                      <Text style={styles.dieMoveChipText}>{idleLeft}</Text>
                    </View>
                  </View>
                )}
              </Animated.View>
            </TouchableOpacity>
          </View>
        );
      })()}

      {/* ─ Chat button — hidden while the chat panel is open ─ */}
      {!chatOpen && (
        <View
          pointerEvents="box-none"
          style={[styles.chatBtnPos, { bottom: 14 + kbLift }]}
        >
          <TouchableOpacity
            style={styles.chatBtn}
            onPress={() => setChatOpen(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="chatbubble" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* ─ Toast — lifted above the chat panel when it's open ─ */}
      {toast && (
        <Animated.View
          style={[
            styles.toast,
            { bottom: 96 + chatInset + kbLift },
            {
              opacity: toastAnim,
              transform: [
                {
                  translateY: toastAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [24, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={["#1E1B4B", "#0F172A"]}
            style={styles.toastInner}
          >
            <Text style={styles.toastText}>{toast}</Text>
          </LinearGradient>
        </Animated.View>
      )}

      {/* ─ Chat panel — inline bottom sheet, board compresses above it ─ */}
      {chatOpen && (
        <ChatSheet
          messages={messages}
          draft={draft}
          onDraftChange={setDraft}
          onSend={(t) => sendChat(t)}
          onClose={() => setChatOpen(false)}
          onPanelLayout={(h) => setChatPanelH(h)}
          scrollRef={chatScroll}
          inputRef={chatInputRef}
          // The COMPACT decision is based on the real keyboard state (both
          // platforms); only POSITION offsets use the iOS-only kbLift.
          kbH={kbH}
        />
      )}
    </LinearGradient>
  );
}

// ── Glow around the ACTIVE player's corner card ───────────────────────────────
// A soft pulsing halo so whose turn it is is obvious at a glance.
function ActiveCardGlow({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(a, {
          toValue: 0,
          duration: 850,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={{ position: "relative" }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -4,
          left: -4,
          right: -4,
          bottom: -4,
          borderRadius: 20,
          borderWidth: 2.5,
          // Turn-glow border follows the player's color (unified HUD).
          borderColor: color,
          opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
          shadowColor: color,
          shadowOpacity: 0.9,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 0 },
          elevation: 8,
        }}
      />
      {children}
    </View>
  );
}

// ── Die turn-glow — the dice pulses with the active player's color while it's
// their turn (the coin turn indicator is now pure motion: the active player's
// coins giggle up and down, no glow).
function DieGlow({ color, size = 56 }: { color: string; size?: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(a, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  // Soft turn-glow: a thin ring that barely clears the die (never reaching
  // the corner cards beside it) with a gentle pulse instead of a hot halo.
  const inset = size * 0.035;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: -inset,
        left: -inset,
        right: -inset,
        bottom: -inset,
        borderRadius: size * 0.36,
        borderWidth: 1.5,
        borderColor: color,
        opacity: a.interpolate({
          inputRange: [0, 1],
          outputRange: [0.12, 0.4],
        }),
        shadowColor: color,
        shadowOpacity: 0.3,
        shadowRadius: size * 0.1,
        shadowOffset: { width: 0, height: 0 },
        elevation: 3,
      }}
    />
  );
}

// ── Capture impact burst ─────────────────────────────────────────────────────
// An expanding player-colored shockwave (ring + soft flash) that plays the
// moment a capturer lands on the captured coin's cell, before the victim runs
// home. Self-removes after ~0.5s via onDone.
function CaptureBurst({
  burst,
  cell,
  onDone,
}: {
  burst: { id: number; x: number; y: number; color: string };
  cell: number;
  onDone: (id: number) => void;
}) {
  const ring = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(1)).current;
  const size = Math.max(34, cell * 1.7);
  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(ring, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(flash, {
        toValue: 0,
        duration: 340,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    anim.start(({ finished }) => {
      if (finished) onDone(burst.id);
    });
    // Stop the burst if the board unmounts mid-animation (prevents a stray
    // setBursts call after teardown).
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: burst.x - size / 2,
        top: burst.y - size / 2,
        width: size,
        height: size,
      }}
    >
      {/* Expanding ring — reads as the impact wave */}
      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          borderRadius: size / 2,
          borderWidth: 3,
          borderColor: burst.color,
          opacity: flash.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1],
          }),
          transform: [
            {
              scale: ring.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 1.25],
              }),
            },
          ],
        }}
      />
      {/* Soft inner flash — a quick colored pop behind the collision */}
      <Animated.View
        style={{
          position: "absolute",
          left: size * 0.22,
          right: size * 0.22,
          top: size * 0.22,
          bottom: size * 0.22,
          borderRadius: size / 2,
          backgroundColor: burst.color,
          opacity: flash.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 0.32],
          }),
          transform: [
            {
              scale: ring.interpolate({
                inputRange: [0, 1],
                outputRange: [0.55, 1.35],
              }),
            },
          ],
        }}
      />
    </View>
  );
}

// ── Loading dots ──────────────────────────────────────────────────────────────
function LoadingDots() {
  return (
    <View style={{ flexDirection: "row", gap: 8, marginTop: 24 }}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} delay={i * 200} />
      ))}
    </View>
  );
}
function Dot({ delay }: { delay: number }) {
  const a = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(a, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(a, {
          toValue: 0.3,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);
  return (
    <Animated.View
      style={{
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: "#7C3AED",
        opacity: a,
      }}
    />
  );
}

// ── Chat bubble floating over a player's corner card ──────────────────────────
function CornerBubble({
  pop,
  cornerIdx,
  chatInset = 0,
  kbH = 0,
  onDone,
}: {
  pop: { id: number; uid: string; name: string; text: string; color: string };
  cornerIdx: number;
  chatInset?: number;
  kbH?: number;
  onDone: (id: number) => void;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(anim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.delay(2200),
      Animated.timing(anim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onDone(pop.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pos = CORNER_POS[cornerIdx % 4];
  const vertKey = pos?.vert === "bottom" ? "bottom" : "top";
  const vertVal = pos?.vert === "bottom" ? 118 + chatInset + kbH : 88;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        [pos?.align ?? "left"]: 12,
        [vertKey]: vertVal,
        maxWidth: 190,
        opacity: anim,
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [6, 0],
            }),
          },
        ],
        zIndex: 60,
      }}
    >
      {/* Message-only bubble — the sender is already identified by the corner
          card the bubble pops over, so no name is shown. */}
      <View style={[styles.bubble, { borderLeftColor: pop.color }]}>
        <Text style={styles.bubbleText} numberOfLines={2}>
          {pop.text}
        </Text>
      </View>
    </Animated.View>
  );
}

// ── Chat panel (inline bottom sheet) ─────────────────────────────────────────
// Sits in normal flow at the bottom of the game: the board (flex:1) compresses
// upward so chat + full board are visible simultaneously. Capped at ~10–16% of
// the screen height (CHAT_MAX_H) with a scrollable list, so the board stays
// visible even while the keyboard is up.
function ChatSheet({
  messages,
  draft,
  onDraftChange,
  onSend,
  onClose,
  onPanelLayout,
  scrollRef,
  inputRef,
  kbH = 0,
}: {
  messages: ChatMsg[];
  draft: string;
  onDraftChange: (t: string) => void;
  onSend: (t: string) => void;
  onClose: () => void;
  onPanelLayout: (h: number) => void;
  scrollRef: React.RefObject<ScrollView | null>;
  inputRef: React.RefObject<TextInput | null>;
  kbH?: number;
}) {
  const submit = () => {
    onSend(draft);
    inputRef.current?.focus();
  };

  // Quick-send emoji bar — a single horizontal scrolling row so it stays
  // compact and never stacks the panel taller.
  const QUICK_EMOJIS = ["😄", "😂", "🔥", "👍", "🎉", "😮", "💪", "❤️"];

  // While the keyboard is up the panel switches to a slim input bar (header +
  // input only — the emoji quick-row and the list hide) so the board keeps
  // the most space; the keyboard's own emoji picker covers quick-replies.
  const sheetMaxH = kbH > 0 ? 96 : CHAT_MAX_H;

  return (
    <View style={styles.chatWrap}>
      <View
        style={[styles.chatSheet, { maxHeight: sheetMaxH }]}
        onLayout={(e) => onPanelLayout(e.nativeEvent.layout.height)}
      >
        <View style={styles.chatHeader}>
          <Text style={styles.chatTitle}>💬 Match Chat</Text>
          <View style={styles.chatLiveTag}>
            <View style={styles.chatLiveDot} />
            <Text style={styles.chatLiveText}>live</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={22} color="#C4B5FD" />
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.chatList}
          contentContainerStyle={styles.chatListContent}
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: true })
          }
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 && (
            <Text style={styles.chatEmpty}>No messages yet — say hi! 👋</Text>
          )}
          {messages.map((m) => (
            <View key={m.id} style={styles.chatMsg}>
              <View style={styles.chatMsgMeta}>
                <Text style={[styles.chatMsgName, { color: m.color }]}>
                  {m.name}
                </Text>
                <Text style={styles.chatMsgTime}>{m.time}</Text>
              </View>
              <View
                style={[styles.chatBubbleRow, { borderLeftColor: m.color }]}
              >
                <Text style={styles.chatMsgText}>{m.text}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        {kbH > 0 ? null : (
          <View style={styles.chatEmojiRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.chatEmojiRowInner}
            >
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
            </ScrollView>
          </View>
        )}

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
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  gameFill: { flex: 1, alignItems: "center", paddingTop: 6, paddingBottom: 6 },
  fullCenter: { flex: 1, justifyContent: "center", alignItems: "center" },
  splashEmoji: { fontSize: 64, marginBottom: 10 },
  splashTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: "#F1F5F9",
    marginBottom: 5,
  },
  splashSub: { fontSize: 14, color: "#64748B" },

  // Auto-roll countdown rendered inside the die itself (no separate pill)
  dieGlowWrapCountdown: { borderColor: "#0F172A", shadowColor: "#FFFFFF" },

  // Board
  // width: '100%' is what stops the shrink loop — the measured width must not
  // depend on the board size itself, or onLayout keeps shrinking the board.
  boardWrap: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 14,
    padding: 3,
  },
  board: {
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(124,58,237,0.4)",
    elevation: 20,
    shadowColor: "#7C3AED",
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },

  // Token
  tokenOuter: {
    position: "absolute",
    inset: 0,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  tokenShine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  tokenInner: { justifyContent: "center", alignItems: "center" },
  tokenLabel: { fontWeight: "900", color: "#FFF" },

  // Corner avatar cards — in-flow inside their positioned wrapper (the wrapper
  // does all the absolute positioning); maxWidth clamps the name so the card
  // can never grow into the die (the die anchors beside the card's measured
  // width).
  cornerCard: {
    position: "relative",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1.5,
    shadowColor: "#6FA0FF",
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    // Fixed box size — the name shrinks to fit, the box never changes size.
    width: 92,
  },
  cornerCardCompact: { paddingVertical: 3, paddingHorizontal: 5, width: 72 },
  cornerAvatarFrame: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 2,
    padding: 2,
    position: "relative",
    backgroundColor: "rgba(8,26,100,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  cornerAvatarFrameCompact: { width: 30, height: 30, borderRadius: 9 },
  cornerAvatar: { width: 34, height: 34, borderRadius: 9 },
  cornerAvatarCompact: { width: 22, height: 22, borderRadius: 6 },
  cornerAvatarPh: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  cornerAvatarPhCompact: { width: 22, height: 22, borderRadius: 6 },
  cornerAvatarInitial: { color: "#FFF", fontWeight: "900", fontSize: 15 },
  cornerAvatarInitialCompact: { fontSize: 11 },
  cornerLevelBadge: {
    position: "absolute",
    bottom: -3,
    right: -3,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: "#0A1B4D",
  },
  cornerLevelBadgeCompact: {
    minWidth: 12,
    height: 12,
    borderRadius: 6,
    paddingHorizontal: 2,
    borderWidth: 1.2,
  },
  cornerLevelText: {
    fontSize: 8,
    fontWeight: "900",
    color: "#1A0A00",
    lineHeight: 9,
  },
  cornerLevelTextCompact: { fontSize: 7, lineHeight: 8 },
  cornerName: {
    fontSize: 10,
    fontWeight: "800",
    marginTop: 4,
    maxWidth: 74,
    textAlign: "center",
    lineHeight: 13,
  },
  cornerNameCompact: {
    fontSize: 8,
    marginTop: 2,
    lineHeight: 10,
    maxWidth: 60,
  },
  cornerPct: { fontSize: 11, fontWeight: "900", marginTop: 1 },

  // Die — anchored beside the active player's corner profile card (DIE_ANCHOR)
  dieArea: { position: "absolute", alignItems: "center", zIndex: 40 },
  dieGlowWrap: {
    width: 56,
    height: 56,
    borderRadius: 15,
    borderWidth: 2.5,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    elevation: 14,
    shadowColor: "#64748B",
    shadowOpacity: 0.8,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  dieGlowWrapRolled: { borderColor: "#0F172A", shadowColor: "#FFFFFF" },
  // Post-roll move-timer pill centered UNDER the die (result dots stay
  // visible on the die face above it).
  dieMoveChip: {
    position: "absolute",
    bottom: -18,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  dieMoveChipPill: {
    minWidth: 34,
    height: 21,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 8,
    backgroundColor: "#0F172A",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  dieMoveChipText: { fontSize: 10, fontWeight: "900", color: "#FFFFFF" },
  dieBody: {
    width: 56,
    height: 56,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  dot: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#F8FAFC",
    transform: [{ translateX: -5 }, { translateY: -5 }],
  },
  dotDark: { backgroundColor: "#0F172A" },
  // Idle die face — a soft centred pip instead of a question mark
  diceIdle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(15,23,42,0.06)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(15,23,42,0.2)",
  },
  diceIdlePip: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: "rgba(15,23,42,0.4)",
  },

  // Chat button (reference-style orange bubble, bottom-centre)
  chatBtnPos: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 50,
  },
  chatBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFF",
    elevation: 10,
    shadowColor: "#F97316",
    shadowOpacity: 0.6,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  // Chat popup bubble
  bubble: {
    backgroundColor: "rgba(8,16,64,0.95)",
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    elevation: 8,
  },
  bubbleText: { color: "#E2E8F0", fontSize: 12, fontWeight: "600" },

  // Chat panel — inline bottom sheet (board compresses above it)
  chatWrap: {
    width: "100%",
    justifyContent: "flex-end",
  },
  // Quick-send emoji bar — one compact horizontal scrolling row
  chatEmojiRow: { marginBottom: 6 },
  chatEmojiRowInner: { gap: 8, paddingVertical: 2, paddingHorizontal: 2 },
  chatEmojiBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  chatEmojiText: { fontSize: 16 },
  chatSheet: {
    width: "100%",
    maxHeight: CHAT_MAX_H,
    backgroundColor: "#0B1026",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1.5,
    borderColor: "rgba(124,58,237,0.35)",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    elevation: 24,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -4 },
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  chatTitle: { color: "#F1F5F9", fontSize: 14, fontWeight: "900", flex: 1 },
  chatLiveTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(34,197,94,0.16)",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  chatLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#22C55E",
  },
  chatLiveText: { color: "#4ADE80", fontSize: 9, fontWeight: "800" },
  // The list shrinks and scrolls inside the compact panel; the input stays pinned.
  chatList: { flexShrink: 1, flexGrow: 0 },
  chatListContent: { paddingBottom: 4 },
  chatEmpty: {
    color: "#64748B",
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 10,
    fontStyle: "italic",
  },
  chatMsg: { marginBottom: 6 },
  chatMsgMeta: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    marginBottom: 1,
  },
  chatMsgName: { fontSize: 10, fontWeight: "900" },
  chatMsgTime: { fontSize: 8, color: "#64748B" },
  chatBubbleRow: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 9,
    borderLeftWidth: 3,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  chatMsgText: { color: "#E2E8F0", fontSize: 13, lineHeight: 18 },
  chatInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginTop: 5,
  },
  chatInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 13,
    color: "#F1F5F9",
    paddingHorizontal: 11,
    paddingVertical: 7,
    maxHeight: 44,
    fontSize: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  chatSend: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#7C3AED",
    alignItems: "center",
    justifyContent: "center",
  },

  // Toast
  toast: {
    position: "absolute",
    bottom: 96,
    alignSelf: "center",
    borderRadius: 24,
    overflow: "hidden",
    elevation: 18,
  },
  toastInner: {
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: "rgba(124,58,237,0.45)",
  },
  toastText: { color: "#F1F5F9", fontSize: 15, fontWeight: "900" },
});
