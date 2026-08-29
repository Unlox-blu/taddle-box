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
import type { HtmlGameResult, PlayerContext } from "../../../../games/types";
import { createGameEngineSocket } from "../../../../services/accountSocketClient";
import { gameSound, useTurnSound } from "../../../../services/gameSound";
// ── Extracted modules ────────────────────────────────────────────────────────
import {
  DICE_ROLL_MS, STEP_MS, ENTRY_MS, CAPTURE_BUDGET_MS, CAPTURE_BEAT_MS,
  CAPTURE_WAIT_MS, TURN_GAP_MS, MOVE_WINDOW_MS, TURN_REVEAL_MAX_MS,
  CAPTURE_SEQ_EXTRA_MS, NO_MOVE_HOLD_MS, BOARD_SIZE, CHAT_MAX_H,
  CORNER_STRIP, PLAYER_COLORS, PLAYER_COLORS_D, PLAYER_COLORS_L,
  BG_TOP, BG_BOTTOM, CORNER_POS, GIGGLE_IDENTITY, TURN_GIGGLE_IDENTITY,
  LUDO_PATH, SAFE_CELLS, HOME_SLOTS, HOME_COLS, HOME_SPOTS,
  PLAYER_PATH_OFFSET, stackOffset, seededStars, getTokenPos, starPts,
  EVENTS, extractEnginePlayers, buildPlayerInfo,
  type ChatMsg,
} from "./shared";
import { styles } from "./ludoStyles";
import {
  ActiveCardGlow, DieGlow, CaptureBurst, LoadingDots,
  CornerBubble, ChatSheet,
} from "./LudoSubComponents";

// Die face dot positions (only used by the die renderer, kept local)
const DOT_POS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 20], [72, 20], [28, 50], [72, 50], [28, 80], [72, 80]],
};
const STARS = seededStars(34);


/**
 * LudoRenderer props — everything needed to render the Ludo board.
 * All game state is provided by LudoRuntime. This component owns
 * only rendering: board, tokens, dice, effects, cards, chat, toasts.
 *
 * No socket. No game logic. No state management. Pure pixels.
 */
type Props = {
  // ── Identity ────────────────────────────────────────────────────────
  matchId: string;
  userId: string;
  players?: PlayerContext[];
  myName: string;
  myAvatar: string | null;
  myLevel?: number;
  onComplete: (result: HtmlGameResult) => void;

  // ── Game state (from LudoRuntime) ───────────────────────────────────
  status: "connecting" | "waiting" | "active" | "finished";
  gameState: any;
  myPlayerIdx: number;
  displayTurn: number;
  setDisplayTurn: (v: number) => void;
  isMyTurn: boolean;
  playerInfo: Record<string, { name: string; avatar?: string; level?: number }>;

  // ── Dice state ──────────────────────────────────────────────────────
  rolling: boolean;
  setRolling: (v: boolean) => void;
  remoteRolling: string | null;
  setRemoteRolling: (v: string | null) => void;
  dicePreview: number | null;
  settledFace: number | null;
  noMoveHold: { playerIdx: number; face: number } | null;
  setNoMoveHold: (v: { playerIdx: number; face: number } | null) => void;

  // ── Chat state ──────────────────────────────────────────────────────
  chatOpen: boolean;
  setChatOpen: (v: boolean) => void;
  messages: ChatMsg[];
  setMessages: (fn: any) => void;
  draft: string;
  setDraft: (v: string) => void;
  chatPopups: Array<{ id: number; uid: string; name: string; text: string; color: string; cornerIdx: number }>;
  setChatPopups: (fn: any) => void;

  // ── Effects ─────────────────────────────────────────────────────────
  bursts: Array<{ id: number; x: number; y: number; color: string }>;
  setBursts: (fn: any) => void;
  burstIdRef: React.MutableRefObject<number>;
  toast: string | null;
  setToast: (v: string | null) => void;

  // ── Layout ──────────────────────────────────────────────────────────
  kbH: number;
  kbLift: number;

  // ── Turn animation management ───────────────────────────────────────
  pendingTurnRef: React.MutableRefObject<number | null>;
  revealTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  activeWalksRef: React.MutableRefObject<number>;
  pendingKeysRef: React.MutableRefObject<Set<string>>;

  // ── Actions (callbacks to LudoRuntime) ──────────────────────────────
  onRoll: () => void;
  onTokenTap: (tokenId: number) => void;
  onSendChat: (text: string) => void;

  // ── Dice tumble lifecycle ──────────────────────────────────────────
  // Called by LudoGame when a tumble animation finishes so LudoRuntime
  // can apply the buffered result and clear the rolling state.
  onRollComplete?: () => void;
  onRemoteRollComplete?: () => void;
};

export default function LudoGame({
  matchId,
  userId,
  players,
  myName,
  myAvatar,
  myLevel,
  onComplete,
  status,
  gameState,
  myPlayerIdx,
  displayTurn,
  setDisplayTurn,
  isMyTurn,
  playerInfo,
  rolling,
  setRolling,
  remoteRolling,
  setRemoteRolling,
  dicePreview,
  settledFace,
  noMoveHold,
  setNoMoveHold,
  chatOpen,
  setChatOpen,
  messages,
  setMessages,
  draft,
  setDraft,
  chatPopups,
  setChatPopups,
  bursts,
  setBursts,
  burstIdRef,
  toast,
  setToast,
  kbH,
  kbLift,
  pendingTurnRef,
  revealTimerRef,
  activeWalksRef,
  pendingKeysRef,
  onRoll,
  onTokenTap,
  onSendChat,
  onRollComplete,
  onRemoteRollComplete,
}: Props) {

  // ── Rendering-only state (board layout, not game state) ──────────────
  const [boardSize, setBoardSize] = useState(BOARD_SIZE);
  const cell = boardSize / 15;
  const [chatPanelH, setChatPanelH] = useState(0);
  const cellRef = useRef(cell);
  cellRef.current = cell;
  const cardWidthsRef = useRef<Record<string, number>>({});
  const dieLockRef = useRef<Record<string, any> | null>(null);
  const chatInset = chatOpen
    ? chatPanelH > 0 ? chatPanelH : Math.min(280, CHAT_MAX_H)
    : 0;

  // ── Re-seat tokens on board resize ─────────────────────────────────────
  // When the chat panel opens or keyboard appears, the board shrinks via
  // onLayout → setBoardSize. The SVG re-renders instantly at the new size,
  // but token Animated.Values still hold positions computed for the OLD cell
  // size. This effect immediately springs every token to its correct position
  // at the new cell size, eliminating the "broken assets" visual glitch.
  useEffect(() => {
    if (!gameState?.tokens) return;
    const tokens = gameState.tokens;
    const order = gameState.turnOrder ?? [];
    Object.entries(tokens).forEach(([uid, tks]: [string, any]) => {
      const pi = order.indexOf(uid);
      (tks || []).forEach((token: any) => {
        const key = `${uid}-${token.id}`;
        const a = tokenAnims[key];
        if (!a) return; // not yet mounted — renderTokens will init
        const { x, y } = getTokenRenderPos(pi, token.id, token.pos ?? -1);
        Animated.parallel([
          Animated.spring(a.x, {
            toValue: x,
            useNativeDriver: false,
            speed: 20,
            bounciness: 6,
          }),
          Animated.spring(a.y, {
            toValue: y,
            useNativeDriver: false,
            speed: 20,
            bounciness: 6,
          }),
        ]).start();
      });
    });
  }, [boardSize]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Dice tumble triggers ───────────────────────────────────────────
  // When LudoRuntime sets rolling=true (own roll) or remoteRolling
  // (opponent/bot roll), trigger the tumble animation. The onDone callback
  // lets LudoRuntime apply the buffered result and clear the state.
  const onRollCompleteRef = useRef(onRollComplete);
  onRollCompleteRef.current = onRollComplete;
  const onRemoteRollCompleteRef = useRef(onRemoteRollComplete);
  onRemoteRollCompleteRef.current = onRemoteRollComplete;

  useEffect(() => {
    if (rolling && !tumbleBusyRef.current) {
      runDiceTumble({ mode: "own", onDone: () => onRollCompleteRef.current?.() });
    }
  }, [rolling]);

  useEffect(() => {
    if (remoteRolling && !tumbleBusyRef.current) {
      runDiceTumble({ mode: "remote", rollerId: remoteRolling, onDone: () => onRemoteRollCompleteRef.current?.() });
    }
  }, [remoteRolling]);

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
  // Tracks in-flight capture sequences so the turn-reveal fallback knows
  // to wait longer for capturer walks + beat + retreat.
  const deferredCapturesRef = useRef<Set<string>>(new Set());
  const capturePollRefs = useRef<ReturnType<typeof setInterval>[]>([]);
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

  // ── Idle safeguard ────────────────────────────────────────────────────────
  // My turn, nothing pressed: 5s silent grace → 5s visible countdown →
  // auto-roll. Once the die settles, every roll gets a move window — the
  // live countdown is shown under the die itself, and the first movable
  // token is auto-moved just before the window ends.
  const [idleLeft, setIdleLeft] = useState<number | null>(null);
  const [moveLeft, setMoveLeft] = useState<number | null>(null);
  const idleTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleMoveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onRollRef = useRef(onRoll);
  onRollRef.current = onRoll;
  const onTokenTapRef = useRef(onTokenTap);
  onTokenTapRef.current = onTokenTap;

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
      clearIdle();
      if (!idleMoveRef.current) {
        let left = MOVE_WINDOW_MS / 1000;
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
              onTokenTapRef.current(movable[0]);
            }
            setMoveLeft(null);
            return;
          }
          setMoveLeft(left);
        }, 1000);
      }
      return clearMove;
    }

    // Waiting for a roll — 5s grace, then visible 5s countdown, then auto-roll.
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
        onRollRef.current();
      }
    }, 1000);
    return () => {
      clearIdle();
    };
  }, [status, isMyTurn, gameState?.dice, myPlayerIdx]);

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
    setBursts((b: Array<{ id: number; x: number; y: number; color: string }>) => [...b.slice(-5), { id, x, y, color }]); // cap active bursts
  }, []);

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
            onPress={() => canMove && onTokenTap(token.id)}
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
        onDone={(id: number) => setBursts((prev: Array<{ id: number; x: number; y: number; color: string }>) => prev.filter((x: { id: number }) => x.id !== id))}
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
          onDone={(id: number) => setChatPopups((p: Array<{ id: number; uid: string; name: string; text: string; color: string; cornerIdx: number }>) => p.filter((x: { id: number }) => x.id !== id))}
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
              onPress={onRoll}
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
          onSend={onSendChat}
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


