/**
 * MatchModeModal — v3
 *
 * AUTO     : select → playerCount → queue
 * PRACTICE : select → playerCount → queue (bots only fill the lobby)
 * CUSTOM   : select → lobby (count + circular ring + invite + bot + code) → queue
 */
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import {
  AppState,
  Animated,
  Easing,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import LottieView from "lottie-react-native";
import StateBlock from "../../common/StateBlock";
import {
  getCachedLottie,
  getCachedLottieSync,
  S3_APP_ICON_LOTTIE_URL,
} from "../../../services/lottie.service";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import GameLogo from "./GameLogo";
import { useAuth } from "../../../context/AuthContext";
import { useThemeColors } from "../../../context/ThemeContext";
import { apiClient } from "../../../services/apiClient";
import { gamesService, type MatchmakingResponse } from "../../../services/games.service";
import { accountSocket } from "../../../services/accountSocketClient";
import { userService } from "../../../services/user.service";
import { fontSizes, radii, spacing, type ColorPalette } from "../../../theme";
import type { Game, MatchmakingEventPayload } from "../../../types";
import { themedAlert } from '../../common/ThemedAlert';

export type MatchMode = "AUTO" | "CUSTOM" | "PRACTICE";

export interface MatchModeModalProps {
  visible: boolean;
  game: Game | null;
  onClose: () => void;
  initialInviteCode?: string | null;  // pre-filled from invite notification accept
  initialTournamentId?: string | null; // pre-selected tournament (AUTO queue joins tournament matchmaking)
  /** Rematch shortcut — skip mode select and jump straight into the queue */
  autoQueue?: boolean;
  /** Which queue to auto-join when autoQueue fires (AUTO default, PRACTICE for practice rematch) */
  initialMode?: MatchMode;
  onMatched?: (request: any, response: MatchmakingResponse) => void;
}

type Step = "select" | "playerCount" | "lobby" | "queue";
type AutoSize = "auto" | number; // "auto" = join any lobby, number = exact size

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMaxPlayers(game: Game | null): number {
  if (!game) return 2;
  return (game as any).maxPlayers || 2;
}

function pid(p: any): string {
  return String(p?.id || p?.userId || p?.username || "");
}

// Positions on a circle given N slots
function circlePositions(total: number, r: number) {
  return Array.from({ length: total }, (_, i) => {
    const angle = (2 * Math.PI * i) / total - Math.PI / 2;
    return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
  });
}


// ─── Component ────────────────────────────────────────────────────────────────

export default function MatchModeModal({
  visible, game, onClose, initialInviteCode, initialTournamentId, autoQueue, initialMode, onMatched,
}: MatchModeModalProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { user } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // ── nav ───────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<MatchMode>("AUTO");
  const [step, setStep] = useState<Step>("select");

  // When the modal becomes visible, skip mode selection for flows that don't
  // need it. We do this in a layout effect so it applies before paint —
  // eliminating the single-frame flash of the "Choose Mode" screen.
  React.useLayoutEffect(() => {
    if (!visible) return;
    if (autoQueue || initialTournamentId) {
      setStep("queue");
      if (autoQueue) setMode(initialMode === "PRACTICE" ? "PRACTICE" : "AUTO");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ── auto / shared ─────────────────────────────────────────────────────────
  const [targetPlayers, setTargetPlayers] = useState<AutoSize>("auto");
  const [selectedRounds, setSelectedRounds] = useState<number>(game?.rounds?.default || 1);

  // ── invite-code join ──────────────────────────────────────────────────────
  const [joinCode, setJoinCode] = useState("");
  const [joinCodeLoading, setJoinCodeLoading] = useState(false);

  // ── lobby (CUSTOM) ────────────────────────────────────────────────────────
  const [lobbyLoading, setLobbyLoading] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState<any[]>([]);
  const [lobbyMaxPlayers, setLobbyMaxPlayers] = useState<number>(2);
  // true = auto size (game max); false = custom stepper. Lives INSIDE the
  // lobby screen — CUSTOM skips the separate slot-size chooser entirely.
  const [lobbyAuto, setLobbyAuto] = useState(true);
  const [lobbyInviteCode, setLobbyInviteCode] = useState<string | null>(null);
  const [followers, setFollowers] = useState<any[]>([]);
  const [followersLoading, setFollowersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingInviteIds, setPendingInviteIds] = useState<string[]>([]);
  // Track when each person was last invited — for 5s re-invite cooldown
  const [invitedAtMap, setInvitedAtMap] = useState<Record<string, number>>({});
  const [copyState, setCopyState] = useState<"Copy" | "Copied!">("Copy");

  // ── queue ─────────────────────────────────────────────────────────────────
  // How many players were already in the lobby when the queue screen appeared.
  // Those pins render instantly ("players already spawned"); only players/bots
  // joining afterwards animate in one by one.
  const [spawnBaseline, setSpawnBaseline] = useState(1);
  const [queuePhase, setQueuePhase] = useState<"searching" | "filling" | "matched">("searching");
  const [statusText, setStatusText] = useState("Searching...");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [botFilling, setBotFilling] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // ── refs ──────────────────────────────────────────────────────────────────
  const matchedRef = useRef(false);
  const cancelledRef = useRef(false);
  const lobbyIdRef = useRef<string | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Self-heal: socket events can be missed (e.g. the client socket reconnects
  // mid-queue after a server restart), leaving the user stuck on "Searching...".
  // This poll checks the lobby's server state and starts the game when it's READY.
  // It is a FALLBACK ONLY: it idles (zero API calls) while the socket is
  // delivering matchmaking events, and backs off exponentially when it isn't.
  const lobbyPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tear-down for the active poll (interval + its socket listeners), so every
  // cancel/close path removes exactly what startLobbyPoll registered.
  const stopLobbyPollRef = useRef<(() => void) | null>(null);
  // Always points at the latest _handleMatched so the poll interval (created
  // once) never calls a stale closure with an outdated mode/game.
  const handleMatchedRef = useRef<(r: any) => void>(() => {});
  // Radar beat: when a match resolves instantly (join response already MATCHED,
  // or the poll finds READY with bots that filled between ticks), the players
  // are shown spawning on the radar for a short beat before the game starts.
  const matchBeatRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presentMatchedRadarRef = useRef<(r: any) => void>(() => {});
  // Latest user, readable from the once-created poll closure.
  const userRef = useRef(user);
  userRef.current = user;
  // Rematch: auto-queue fired exactly once per modal open (guarded so the
  // socket-listeners effect + remounts can never double-join matchmaking).
  const autoQueuedRef = useRef(false);

  // ── reset ─────────────────────────────────────────────────────────────────
  useEffect(() => { if (!visible) _reset(); }, [visible]);

  function _reset() {
    autoQueuedRef.current = false;
    setMode("AUTO");
    setStep("select");
    setTargetPlayers("auto");
    setJoinCode(""); setJoinCodeLoading(false);
    setLobbyLoading(false); setLobbyPlayers([]); setLobbyMaxPlayers(2);
    setLobbyAuto(true);
    setLobbyInviteCode(null); setFollowers([]); setFollowersLoading(false);
    setSearchQuery(""); setPendingInviteIds([]); setCopyState("Copy");
    setInvitedAtMap({});
    setSpawnBaseline(1);
    setQueuePhase("searching"); setStatusText("Searching..."); setCountdown(null);
    setBotFilling(false); setCancelling(false);
    matchedRef.current = false; cancelledRef.current = false;
    lobbyIdRef.current = null;
    if (fallbackTimerRef.current) clearInterval(fallbackTimerRef.current);
    fallbackTimerRef.current = null;
    stopLobbyPollRef.current?.();
    if (matchBeatRef.current) clearTimeout(matchBeatRef.current);
    matchBeatRef.current = null;
  }

  // ── load mutual followers ─────────────────────────────────────────────────
  const loadFollowers = useCallback(async () => {
    if (!user?.username) return;
    setFollowersLoading(true);
    try {
      const [fRes, gRes] = await Promise.all([
        userService.getFollowers(user.username),
        userService.getFollowing(user.username),
      ]);
      const fl: any[] = Array.isArray(fRes?.data) ? fRes.data : [];
      const gl: any[] = Array.isArray(gRes?.data) ? gRes.data : [];
      setFollowers(fl.filter((p) => gl.some((g) => pid(g) === pid(p))));
    } catch { setFollowers([]); }
    finally { setFollowersLoading(false); }
  }, [user?.username]);


  // ── create lobby ──────────────────────────────────────────────────────────
  const createLobby = useCallback(async (maxP: number) => {
    if (!game) return;
    setLobbyLoading(true);
    try {
      const res = await gamesService.joinMatchmaking({ gameId: game.id, mode: "CUSTOM", targetPlayers: maxP, rounds: selectedRounds });
      const d = res.data as any;
      const id = d.lobbyId || d.ticket?.lobbyId;
      if (!id) throw new Error("No lobby ID returned");
      lobbyIdRef.current = id;
      setLobbyPlayers(d.players || []);
      setLobbyMaxPlayers(d.maxPlayers || maxP);
      // Fetch full DTO for server invite_code
      try {
        const lr = await apiClient.get(`/game/lobbies/${id}`);
        const ld = (lr as any).data?.data ?? (lr as any).data;
        if (ld?.settings?.inviteCode) setLobbyInviteCode(ld.settings.inviteCode);
        if (Array.isArray(ld?.players)) setLobbyPlayers(ld.players);
      } catch { /* fallback to UUID segment */ }
    } catch (e: any) {
      themedAlert("Error", e?.response?.data?.message || "Could not create lobby.");
      onClose();
    } finally { setLobbyLoading(false); }
  }, [game, onClose, selectedRounds]);

  // ── socket listeners (lobby + queue steps) ────────────────────────────────
  useEffect(() => {
    if (step !== "lobby" && step !== "queue") return;

    const onLobbyUpdated = (data: MatchmakingEventPayload) => {
      const inc = data?.lobbyId || data?.ticket?.lobbyId || data?.id;
      if (inc && inc !== lobbyIdRef.current) return;
      const players = data?.players || data?.lobbyState?.players || [];
      const max = data?.maxPlayers || data?.lobbyState?.maxPlayers;
      setLobbyPlayers(players);
      if (max) setLobbyMaxPlayers(max);
      const code = data?.settings?.inviteCode || data?.inviteCode;
      if (code) setLobbyInviteCode(code);
      // When server confirms a player joined, remove them from pending invite list
      const joinedIds = new Set(players.map((p: any) => pid(p)));
      setPendingInviteIds((prev) => prev.filter((id) => !joinedIds.has(id)));
      // Sync server-side pendingInvites (people invited but not yet joined)
      const serverPending: Array<{userId: string}> = data?.settings?.pendingInvites || [];
      if (serverPending.length > 0) {
        setPendingInviteIds((prev) => {
          const merged = new Set([...prev, ...serverPending.map((p) => p.userId)]);
          return Array.from(merged).filter((id) => !joinedIds.has(id));
        });
      }
      if (data?.status === "MATCHED" || data?.ticket?.status === "MATCHED") {
        _handleMatched(data);
      }
    };

    const onMatched = (data: MatchmakingEventPayload) => {
      const inc = data?.lobbyId || data?.ticket?.lobbyId;
      if (inc && inc !== lobbyIdRef.current && lobbyIdRef.current) return;
      _handleMatched(data);
    };

    const onTimedOut = (data: MatchmakingEventPayload) => {
      const inc = data?.lobbyId || data?.id;
      if (inc && inc !== lobbyIdRef.current && lobbyIdRef.current) return;
      if (matchedRef.current || cancelledRef.current) return;
      // CUSTOM lobbies expire after a long idle — close the queue gracefully.
      cancelledRef.current = true;
      if (fallbackTimerRef.current) clearInterval(fallbackTimerRef.current);
      setStatusText("Lobby expired. Please try again.");
      setTimeout(() => onClose(), 600);
    };

    accountSocket.events.on("matchmaking:lobbyUpdated", onLobbyUpdated);
    accountSocket.events.on("matchmaking:matched", onMatched);
    accountSocket.events.on("matchmaking:timedOut", onTimedOut);
    return () => {
      accountSocket.events.off("matchmaking:lobbyUpdated", onLobbyUpdated);
      accountSocket.events.off("matchmaking:matched", onMatched);
      accountSocket.events.off("matchmaking:timedOut", onTimedOut);
    };
  }, [step]);

  // Poll the lobby on the server so a missed matchmaking:matched event can't
  // leave the user stuck on the queue screen forever (e.g. after a server
  // restart reconnects the socket mid-queue). Stops on cancel/match.
  //
  // The real-time channel is the socket (matchmaking:lobbyUpdated / matched /
  // timedOut); this poll is ONLY a safety net, so it never runs at full speed
  // while the socket is healthy:
  //   - socket connected + delivering recently → ZERO API calls (local tick idles)
  //   - socket silent / offline → exponential backoff 2s → 4s → 8s → 16s (cap)
  //   - app backgrounded → no requests; a self-heal poll fires on foreground
  const startLobbyPoll = useCallback((lobbyId: string) => {
    // Tear down any previous poll (interval + socket listeners).
    stopLobbyPollRef.current?.();

    let backoffMs = 2000;
    const BACKOFF_CAP_MS = 16000;
    // A socket matchmaking event inside this window proves the push channel is
    // alive → the poll stays quiet.
    const SOCKET_STALE_MS = 8000;
    let nextPollAt = Date.now(); // first poll fires immediately
    let inFlight = false;
    let lastSocketEvent = Date.now();

    const onSocketActivity = () => {
      lastSocketEvent = Date.now();
      backoffMs = 2000;
      nextPollAt = Date.now();
    };
    accountSocket.events.on("matchmaking:lobbyUpdated", onSocketActivity);
    accountSocket.events.on("matchmaking:matched", onSocketActivity);
    accountSocket.events.on("matchmaking:timedOut", onSocketActivity);

    const stop = () => {
      if (lobbyPollRef.current) { clearInterval(lobbyPollRef.current); lobbyPollRef.current = null; }
      accountSocket.events.off("matchmaking:lobbyUpdated", onSocketActivity);
      accountSocket.events.off("matchmaking:matched", onSocketActivity);
      accountSocket.events.off("matchmaking:timedOut", onSocketActivity);
      stopLobbyPollRef.current = null;
    };
    stopLobbyPollRef.current = stop;

    lobbyPollRef.current = setInterval(async () => {
      if (matchedRef.current || cancelledRef.current) { stop(); return; }
      // Never burn requests while backgrounded — the queue/state resume on return.
      if (AppState.currentState !== "active") return;

      const now = Date.now();
      const socketHealthy =
        !!accountSocket.socket?.connected && now - lastSocketEvent < SOCKET_STALE_MS;
      if (socketHealthy || now < nextPollAt || inFlight) return;

      inFlight = true;
      try {
        const res = await apiClient.get(`/game/lobbies/${lobbyId}`);
        const d = (res as any).data?.data ?? (res as any).data;
        // Sync the radar pins with the live player list on every tick. The
        // matchmaking:lobbyUpdated socket event usually drives bots appearing
        // one-by-one, but after a socket reconnect mid-queue those events can
        // be missed — without this, the radar would sit at the spawn baseline
        // even though bots are joining server-side. Only re-render when the
        // list actually changed so pins don't remount/flicker.
        if (Array.isArray(d?.players) && d.players.length > 0) {
          setLobbyPlayers((prev) => {
            const prevKey = prev.map((p: any) => pid(p)).sort().join(",");
            const nextKey = d.players.map((p: any) => pid(p)).sort().join(",");
            return prevKey === nextKey ? prev : d.players;
          });
        }
        if (d?.settings?.targetPlayers) setLobbyMaxPlayers(d.settings.targetPlayers);
        if (d?.state?.status === "READY") {
          stop();
          // Build a MATCHED-shaped response from the lobby DTO so the flow is
          // identical to the socket path (players + matchGroupId).
          const players = (Array.isArray(d.players) ? d.players : []).map((p: any) => ({
            id: pid(p),
            displayName: p.displayName || p.name || p.username || "Player",
            username: p.username,
            avatar: p.avatar,
            isBot: Boolean(p.isBot),
            team: p.team !== undefined ? p.team : 1,
            seat: p.seat !== undefined ? p.seat : 0,
            status: "JOINED",
          }));
          presentMatchedRadarRef.current({
            status: "MATCHED",
            lobbyId,
            players,
            matchMetadata: {
              matchGroupId: lobbyId,
              lobbyId,
              maxPlayers: players.length,
              playerSnapshots: players,
              teamsLocked: !!(d.settings?.teamsLocked),
            },
          });
          return;
        }
        // The socket is still suspect after a poll → back off.
        backoffMs = Math.min(backoffMs * 2, BACKOFF_CAP_MS);
        nextPollAt = Date.now() + backoffMs;
      } catch {
        // Lobby not found / offline — keep polling with backoff; the socket
        // path or cancel handles it.
        backoffMs = Math.min(backoffMs * 2, BACKOFF_CAP_MS);
        nextPollAt = Date.now() + backoffMs;
      } finally {
        inFlight = false;
      }
    }, 1000);
  }, []);

  function _handleMatched(response: any) {
    if (matchedRef.current || cancelledRef.current) return;
    matchedRef.current = true;
    stopLobbyPollRef.current?.();
    setQueuePhase("matched");
    setStatusText("Match found! Starting game...");
    if (fallbackTimerRef.current) clearInterval(fallbackTimerRef.current);
    const normalized = {
      ...response,
      matchMetadata: response.matchMetadata || response.data?.matchMetadata || null,
      status: "MATCHED",
      ticket: response.ticket || { status: "MATCHED" },
    };
    const request = {
      game,
      mode: initialTournamentId ? "tournament"
        : mode === "PRACTICE" ? "practice"
        : mode === "AUTO" ? "auto"
        : "invite",
      lobbyId: lobbyIdRef.current,
    };
    setTimeout(() => { onMatched?.(request, normalized); onClose(); }, 600);
  }

  // Keep the ref pointing at the latest closure so startLobbyPoll (created once
  // with [] deps) can never invoke a stale _handleMatched — especially on the
  // FIRST match where no socket event has fired yet and the poll is the only
  // thing that can resolve the queue (otherwise the ref is still the initial
  // noop and the user sits on "Searching..." forever).
  handleMatchedRef.current = _handleMatched;

  // Instant-match radar beat. Practice lobbies fill with bots in a single
  // server sweep, so the join response / poll can already see READY — without
  // this the radar only ever shows "You" and then jumps straight into the
  // match. Populate the pins (host excluded so displayPlayers adds "You"),
  // stagger them via spawnBaseline=1, and only hand off after a short beat.
  const presentMatchedRadar = (response: any) => {
    const userId = userRef.current?.id;
    const raw = Array.isArray(response?.players) ? response.players : [];
    const others = raw.filter((p: any) => pid(p) !== userId);
    setLobbyPlayers(others);
    setLobbyMaxPlayers(response?.maxPlayers || others.length + 1 || 2);
    setSpawnBaseline(1); // host only pre-spawns; bots animate in one-by-one
    setQueuePhase("filling");
    setStatusText("Match found! Spawning players...");
    if (matchBeatRef.current) clearTimeout(matchBeatRef.current);
    matchBeatRef.current = setTimeout(() => {
      if (!cancelledRef.current && !matchedRef.current) {
        handleMatchedRef.current(response);
      }
    }, 1600);
  };
  presentMatchedRadarRef.current = presentMatchedRadar;

  // ── navigation ────────────────────────────────────────────────────────────
  const pickMode = (m: MatchMode) => {
    setMode(m);
    setTargetPlayers("auto");
    if (m === "CUSTOM") {
      // CUSTOM goes straight into the lobby — the auto/custom slot-size
      // selector lives inside the lobby screen itself (no separate step).
      setLobbyAuto(true);
      loadFollowers();
      createLobby(maxP).then(() => setStep("lobby"));
      return;
    }
    // AUTO / PRACTICE still pick a player count first.
    setStep("playerCount");
  };

  // Called from the auto/custom slot-size screen. AUTO/PRACTICE queue with the
  // chosen size; CUSTOM never reaches this step (it goes straight to lobby).
  const proceedFromCount = () => {
    startAutoQueue(targetPlayers, mode === "PRACTICE" ? "PRACTICE" : "AUTO");
  };

  const goBack = () => {
    if (step === "playerCount") setStep("select");
    // CUSTOM lobby came straight from mode select (or join-by-code from select)
    else if (step === "lobby") setStep("select");
  };

  // ── join by invite code (called from select screen button OR notification auto-accept) ──
  const joinByCode = useCallback(async (overrideCode?: string) => {
    const code = (overrideCode || joinCode).trim().toUpperCase();
    if (!code || !game) return;
    setJoinCodeLoading(true);
    try {
      const res = await apiClient.post("/game/lobbies/join", { inviteCode: code });
      const d = (res as any).data?.data ?? (res as any).data;
      const id = d?.id || d?.lobbyId;
      if (!id) throw new Error("Invalid lobby response");
      lobbyIdRef.current = id;
      setLobbyPlayers(Array.isArray(d?.players) ? d.players : []);
      setLobbyMaxPlayers(d?.settings?.targetPlayers || d?.state?.currentPlayers || 2);
      const invCode = d?.settings?.inviteCode || null;
      if (invCode) setLobbyInviteCode(invCode);
      setMode("CUSTOM");
      loadFollowers();
      setStep("lobby");
    } catch (e: any) {
      themedAlert("Invalid Code", e?.response?.data?.message || "Lobby not found or expired.");
    } finally {
      setJoinCodeLoading(false);
    }
  }, [game, joinCode, loadFollowers]);

  // ── auto-join when opened from invite notification ────────────────────────
  useEffect(() => {
    if (!visible) return;
    if (initialInviteCode) {
      setJoinCode(initialInviteCode);
      const t = setTimeout(() => joinByCode(initialInviteCode), 80);
      return () => clearTimeout(t);
    }
  }, [visible, initialInviteCode]);

  // ── AUTO / PRACTICE queue ─────────────────────────────────────────────────
  // PRACTICE queues the same way as AUTO but the lobby is solo+private — the
  // server bot-fill sweep fills every remaining seat with bots, never other users.
  const startAutoQueue = (size: AutoSize, queueMode: "AUTO" | "PRACTICE" = "AUTO") => {
    if (!game) return;
    cancelledRef.current = false; matchedRef.current = false;
    const isPractice = queueMode === "PRACTICE";
    // PRACTICE is solo-vs-bots — no real players will ever join, so bots start
    // joining IMMEDIATELY (the server sweep has no 15s window for practice).
    // Skip the cosmetic 15s countdown and go straight to the filling radar.
    setQueuePhase(isPractice ? "filling" : "searching");
    setStatusText(
      isPractice
        ? "Preparing your practice lobby..."
        : "Searching for taddlers..."
    );
    setCountdown(null); setBotFilling(isPractice); setStep("queue");
    // "auto" = no targetPlayers constraint, backend joins any waiting lobby
    const exactCount = size === "auto" ? undefined : size;
    const tournamentId = initialTournamentId || undefined;
    const request = {
      game,
      mode: tournamentId ? "tournament" : isPractice ? "practice" : "auto",
      targetPlayers: exactCount,
    };
    gamesService.joinMatchmaking({
      gameId: game.id,
      mode: tournamentId ? "TOURNAMENT" : isPractice ? "PRACTICE" : "AUTO",
      tournamentId,
      targetPlayers: exactCount,
      rounds: selectedRounds,
    })
      .then((res) => {
        if (cancelledRef.current) return;
        const d = res.data as any;
        if (d.status === "MATCHED" || d.ticket?.status === "MATCHED") { presentMatchedRadarRef.current(d); return; }
        const id = d.lobbyId || d.ticket?.lobbyId;
        if (id) {
          lobbyIdRef.current = id;
          startLobbyPoll(id);
        }
        // Pre-populate players/max so radar pins show immediately when joining
        // an existing lobby (players already spawned) vs a fresh one (I'm first).
        if (Array.isArray(d?.players)) setLobbyPlayers(d.players);
        if (d?.maxPlayers || d?.lobbyState?.maxPlayers) {
          setLobbyMaxPlayers(d.maxPlayers || d.lobbyState.maxPlayers);
        }
        // Joining an existing lobby? Its current players are "already spawned"
        // — render them instantly; only later joins (bots filling slots) animate.
        setSpawnBaseline(Math.max(1, Array.isArray(d?.players) ? d.players.length : 1));
        // The pill mirrors the backend timing: AUTO lobbies have a 30s window
        // (bots quietly start filling at 15s), so the countdown runs the full
        // 30s. PRACTICE fills from t=0 — its pill is hidden anyway
        // (phase=filling, botFilling=true). Tournament queues never bot-fill
        // and rely on matchmaking:timedOut at lobby expiry.
        const expiresAt = d.expiresAt ? new Date(d.expiresAt).getTime() : Date.now() + 30_000;
        const countdownDeadline = expiresAt;
        fallbackTimerRef.current = setInterval(() => {
          if (cancelledRef.current || matchedRef.current) { clearInterval(fallbackTimerRef.current!); return; }
          const rem = Math.max(0, Math.ceil((countdownDeadline - Date.now()) / 1000));
          setCountdown(rem);
          if (rem <= 0) {
            clearInterval(fallbackTimerRef.current!);
            // AUTO/PRACTICE queues: the server bot-fills the expired lobby and emits
            // matchmaking:matched. Tournament queues never bot-fill (paid/competitive)
            // — the server TIMED_OUT event (matchmaking:timedOut) closes the queue
            // gracefully. Keep waiting either way.
            const isTournament = !!tournamentId;
            setBotFilling(!isTournament);
            setQueuePhase(isTournament ? "searching" : "filling");
            // Practice bots joined from t=0 — never regress the message to
            // "no players found" once the cosmetic expiry passes.
            setStatusText(
              isTournament
                ? "Still searching for tournament opponents..."
                : isPractice
                  ? "Bots are joining your practice match..."
                  : "Waiting for players to join..."
            );
            // Safety net: if the server never resolves (e.g. lobby emptied), close gracefully.
            fallbackTimerRef.current = setTimeout(() => {
              if (!matchedRef.current && !cancelledRef.current) {
                cancelledRef.current = true;
                onClose();
              }
            }, 60_000);
          }
        }, 1000);
      })
      .catch((e: any) => {
        if (!cancelledRef.current) {
          themedAlert("Error", e?.response?.data?.message || "Could not join matchmaking.");
          onClose();
        }
      });
  };

  // ── instant rematch re-queue ──────────────────────────────────────────────
  useEffect(() => {
    if (!visible || !autoQueue || !game) return;
    if (autoQueuedRef.current) return;
    autoQueuedRef.current = true;
    const qm = initialMode === "PRACTICE" ? "PRACTICE" : "AUTO";
    setMode(qm);
    startAutoQueue("auto", qm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, autoQueue, game, initialMode]);

  // ── tournament queue — skip mode select, jump straight to TOURNAMENT queue ──
  useEffect(() => {
    if (!visible || !initialTournamentId || !game) return;
    if (autoQueue) return;
    if (autoQueuedRef.current) return;
    autoQueuedRef.current = true;
    setMode("AUTO");
    startAutoQueue("auto", "AUTO");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialTournamentId, game, autoQueue]);


  // ── CUSTOM lobby actions ──────────────────────────────────────────────────
  // Sends a push notification to the friend — they must tap Accept to actually join.
  // Re-invite allowed after 5s if no response.
  const inviteFriend = async (person: any) => {
    const id = lobbyIdRef.current;
    if (!id) return;
    const personId = pid(person);

    // Enforce 5s cooldown
    const lastInvite = invitedAtMap[personId];
    if (lastInvite && Date.now() - lastInvite < 5000) return;

    try {
      await apiClient.post(`/game/lobbies/${id}/invitations`, { opponentId: personId });
      setPendingInviteIds((prev) => [...prev.filter((i) => i !== personId), personId]);
      setInvitedAtMap((prev) => ({ ...prev, [personId]: Date.now() }));
    } catch (e: any) {
      themedAlert("Error", e?.response?.data?.message || "Could not send invite.");
    }
  };

  const inviteBot = async () => {
    const id = lobbyIdRef.current;
    if (!id) return;
    try {
      // fillLobbyBots now returns full getLobby DTO
      const res = await apiClient.post(`/game/lobbies/${id}/fill-bots`, { count: 1 });
      const d = (res as any).data?.data ?? (res as any).data;
      // Merge server-confirmed players (bots appear in d.players from getLobby DTO)
      if (Array.isArray(d?.players)) setLobbyPlayers(d.players);
      if (d?.state?.currentPlayers !== undefined) setLobbyMaxPlayers(d.settings?.targetPlayers || lobbyMaxPlayers);
    } catch (e: any) {
      themedAlert("Error", e?.response?.data?.message || "Could not add bot.");
    }
  };

  const removePlayer = async (playerId: string) => {
    const id = lobbyIdRef.current;
    if (!id) return;
    try {
      await apiClient.delete(`/game/lobbies/${id}/players/${playerId}`);
      // Refresh from server so bots in settings.bots are also reconciled
      const res = await apiClient.get(`/game/lobbies/${id}`);
      const d = (res as any).data?.data ?? (res as any).data;
      if (Array.isArray(d?.players)) setLobbyPlayers(d.players);
      if (d?.state?.currentPlayers !== undefined) {
        setLobbyMaxPlayers(d.settings?.targetPlayers || lobbyMaxPlayers);
      }
    } catch { /* reconciled via socket */ }
  };

  // Cancel a pending invite — MUST hit the server so settings.pendingInvites is
  // cleared (otherwise the invite resurrects from stale local state and the
  const changeLobbySize = async (next: number) => {
    const id = lobbyIdRef.current;
    setLobbyMaxPlayers(next);
    if (id) {
      try { await apiClient.patch(`/game/lobbies/${id}`, { targetPlayers: next }); }
      catch { /* optimistic — ignore */ }
    }
  };

  // Auto = game's max lobby size (stepper disabled). Custom = exact stepper.
  const toggleLobbyAuto = (auto: boolean) => {
    setLobbyAuto(auto);
    if (auto) changeLobbySize(maxP);
  };

  const copyCode = async () => {
    const code = lobbyInviteCode || lobbyIdRef.current?.split("-")[0].toUpperCase() || "";
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopyState("Copied!");
    setTimeout(() => setCopyState("Copy"), 1600);
  };

  // ── CUSTOM → queue ────────────────────────────────────────────────────────
  // Full lobby → start the match immediately. Non-full lobby → queue for
  // matchmaking: the server sweep fills the remaining slots one bot at a time
  // (2.5–5s apart) and starts the match when the lobby is full — this screen
  // shows the ring filling up live, just like the AUTO queue radar.
  const proceedFromLobby = async () => {
    if (!game) return;
    cancelledRef.current = false; matchedRef.current = false;
    const id = lobbyIdRef.current;
    if (!id) return;

    if (allFilled) {
      // Start Match — lobby already full, start immediately.
      setQueuePhase("filling"); setStatusText("Starting match...");
      setStep("queue");
      try {
        const res = await apiClient.post(`/game/lobbies/${id}/start`);
        const d = (res as any).data?.data ?? (res as any).data;
        if (d?.status === "MATCHED" || d?.matchMetadata || d?.players) {
          _handleMatched(d);
        } else {
          setStep("lobby"); setQueuePhase("searching");
          setStatusText("Lobby still open — add players or bots to start.");
        }
      } catch (e: any) {
        if (!cancelledRef.current) {
          themedAlert("Error", e?.response?.data?.message || "Could not start match.");
          setStep("lobby"); setQueuePhase("searching");
        }
      }
      return;
    }

    // Auto Match & Proceed — queue the lobby; bots will join to fill open slots.
    if (fallbackTimerRef.current) clearInterval(fallbackTimerRef.current);
    // Everyone currently in the lobby is "already spawned" — render instantly;
    // only bots that join to fill slots animate in one by one.
    setSpawnBaseline(Math.max(1, displayPlayers.filter((p: any) => p._status !== "invited").length));
    setQueuePhase("searching"); setStatusText("Queuing lobby — waiting for players to join...");
    setCountdown(30); setBotFilling(false); setStep("queue");
    startLobbyPoll(id);
    try {
      const res = await apiClient.post(`/game/lobbies/${id}/queue`, { active: true });
      const d = (res as any).data?.data ?? (res as any).data;
      if (Array.isArray(d?.players)) setLobbyPlayers(d.players);
      if (d?.settings?.targetPlayers) setLobbyMaxPlayers(d.settings.targetPlayers);
      // NOTE: /queue returns the getLobby DTO, which always has a non-empty
      // players array (host is always in it) — so never treat the status of
      // players as "matched". Only a genuinely resolved lobby (status READY from
      // fillMatchmakingLobby, or matchMetadata) counts. Otherwise we'd skip the
      // matchmaking screen and jump straight to "Match found!".
      if (d?.status === "MATCHED" || d?.state?.status === "READY" || d?.matchMetadata) {
        _handleMatched(d);
        return;
      }
      // Cosmetic countdown for the 30s matchmaking window; the sweep's
      // matchmaking:lobbyUpdated / matchmaking:matched events drive the rest.
      const queueExpiry = Date.now() + 30_000;
      fallbackTimerRef.current = setInterval(() => {
        if (cancelledRef.current || matchedRef.current) { clearInterval(fallbackTimerRef.current!); return; }
        const rem = Math.max(0, Math.ceil((queueExpiry - Date.now()) / 1000));
        setCountdown(rem);
        if (rem <= 0) {
          clearInterval(fallbackTimerRef.current!);
          setBotFilling(true); setQueuePhase("filling");
          // The server holds off up to 30s while fresh invites are out, so keep
          // the copy neutral while the lobby continues filling.
          setStatusText(
            pendingInviteIds.length > 0
              ? "Waiting for invited taddlers to accept..."
              : "Waiting for players to join..."
          );
        }
      }, 1000);
    } catch (e: any) {
      if (!cancelledRef.current) {
        themedAlert("Error", e?.response?.data?.message || "Could not queue the lobby.");
        setStep("lobby"); setQueuePhase("searching");
      }
    }
  };

  // Fully stop the queue: mark cancelled, kill every timer/poll so no late
  // matchmaking:matched socket event or READY lobby poll can start the match
  // in the background, cancel the server ticket (or unqueue a custom lobby),
  // then close. Used by the header X, the Android back button and Cancel.
  // Previously the X only cancelled the ticket — cancelledRef stayed false and
  // the poll kept running, so a match that resolved moments later dragged the
  // user into a game they had just closed.
  const hardCancelQueue = useCallback(async () => {
    cancelledRef.current = true;
    if (fallbackTimerRef.current) { clearInterval(fallbackTimerRef.current); fallbackTimerRef.current = null; }
    stopLobbyPollRef.current?.();
    if (matchBeatRef.current) { clearTimeout(matchBeatRef.current); matchBeatRef.current = null; }
    const id = lobbyIdRef.current;
    if (mode === "CUSTOM" && id) {
      apiClient.post(`/game/lobbies/${id}/queue`, { active: false }).catch(() => {});
    } else {
      try { await gamesService.cancelMatchmakingTicket(); } catch { /* ok */ }
    }
    onClose();
  }, [mode, onClose]);

  // Close (X) from the queue screen: unqueue a custom lobby so bots stop
  // joining (or cancel the AUTO/tournament ticket), then close the modal.
  // Otherwise the lobby would keep filling and start a match without the host.
  const handleHeaderClose = async () => {
    if (step !== "queue") { onClose(); return; }
    await hardCancelQueue();
  };

  const cancelQueue = async () => {
    cancelledRef.current = true; setCancelling(true);
    if (fallbackTimerRef.current) clearInterval(fallbackTimerRef.current);
    const id = lobbyIdRef.current;
    try {
      if (mode === "CUSTOM" && id) {
        // Return to the manual lobby screen — unqueue only, do NOT cancel the
        // host's ticket (that would kick them out of their own lobby). Also
        // stop the READY poll, or a lobby that filled between ticks could
        // still resolve and drag the host into a match while on the lobby.
        stopLobbyPollRef.current?.();
        if (matchBeatRef.current) { clearTimeout(matchBeatRef.current); matchBeatRef.current = null; }
        await apiClient.post(`/game/lobbies/${id}/queue`, { active: false });
        cancelledRef.current = false;
        setCancelling(false);
        setStep("lobby"); setQueuePhase("searching"); setStatusText("Searching...");
        return;
      }
      await gamesService.cancelMatchmakingTicket();
    } catch { /* ok */ }
    setCancelling(false); onClose();
  };

  // ── derived ───────────────────────────────────────────────────────────────
  const maxP = getMaxPlayers(game);
  const lobbyCode = lobbyInviteCode || lobbyIdRef.current?.split("-")[0].toUpperCase() || "------";

  const displayPlayers = useMemo<any[]>(() => {
    const confirmed: any[] = lobbyPlayers.map((p) => ({
      ...p,
      _status: p.isBot ? "bot" : "joined",
    }));
    const seen = new Set(confirmed.map((p) => pid(p)));
    const hostId = user?.id || "";
    if (!seen.has(hostId)) {
      confirmed.unshift({
        id: hostId,
        name: user?.name || user?.username || "You",
        username: user?.username,
        avatar: (user as any)?.avatar || (user as any)?.avatarUrl,
        _status: "host",
      });
      seen.add(hostId);
    }
    return confirmed;
  }, [lobbyPlayers, followers, user]);

  // Invited friends are placeholders, not lobby members — they only count
  // once they accept and actually join. This also keeps "Start Match" from
  // lighting up while seats are merely reserved by unanswered invites.
  const filledCount = displayPlayers.filter((p: any) => p._status !== "invited").length;
  const allFilled = filledCount >= lobbyMaxPlayers;

  const filteredFollowers = useMemo(() => {
    const taken = new Set([...lobbyPlayers.map((p) => pid(p)), user?.id || ""]);
    const q = searchQuery.trim().toLowerCase();
    return followers.filter((p) => {
      if (taken.has(pid(p))) return false;
      if (!q) return true;
      return `${p.name || ""} ${p.username || ""}`.toLowerCase().includes(q);
    });
  }, [followers, lobbyPlayers, user, searchQuery]);

  if (!game) return null;

  const headerTitle =
    step === "select"        ? "Choose Mode"
    : step === "playerCount" ? "Player Count"
    : step === "lobby"       ? "Custom Lobby"
    : initialTournamentId    ? "Tournament Queue"
    : "Matchmaking";

  const canGoBack = step === "playerCount" || step === "lobby";


  // ── render ────────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleHeaderClose}>
      <View style={[styles.root, { paddingTop: insets.top || 16 }]}>
        {/* ── header ── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={canGoBack ? goBack : handleHeaderClose}>
            <Ionicons name={canGoBack ? "arrow-back" : "close"} size={22} color={colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <View style={styles.headerBtn} />
        </View>

        {/* ── select ── */}
        {step === "select" && (
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionLabel}>How do you want to play?</Text>

            {/* Practice Mode — first */}
            <TouchableOpacity style={styles.modeCard} activeOpacity={0.85} onPress={() => pickMode("PRACTICE")}>
              <LinearGradient colors={["#0EA5E9", "#22C55E"]} style={styles.modeIconCircle}>
                <Ionicons name="fitness" size={22} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.modeTitle}>Practice Match</Text>
                <Text style={styles.modeDesc}>Just Warm up! Entry fee applies, no XP rewards.</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
            </TouchableOpacity>

            {/* Auto Match — second */}
            <TouchableOpacity style={styles.modeCard} activeOpacity={0.85} onPress={() => pickMode("AUTO")}>
              <LinearGradient colors={[colors.primary, colors.cyanDark]} style={styles.modeIconCircle}>
                <Ionicons name="flash" size={22} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.modeTitle}>Auto Match</Text>
                <Text style={styles.modeDesc}>Jump into a global taddlers world.</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
            </TouchableOpacity>

            {/* Custom Lobby */}
            <TouchableOpacity style={styles.modeCard} activeOpacity={0.85} onPress={() => pickMode("CUSTOM")}>
              <LinearGradient colors={["#7C3AED", "#4F46E5"]} style={styles.modeIconCircle}>
                <Ionicons name="people" size={22} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.modeTitle}>Custom Match</Text>
                <Text style={styles.modeDesc}>Have a fun with mutual taddlers.</Text>
              </View>
              {lobbyLoading
                ? <StateBlock inline loading />
                : <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />}
            </TouchableOpacity>

            {/* Join by code */}
            <View style={styles.joinCodeCard}>
              <View style={styles.joinCodeHeader}>
                <Ionicons name="key-outline" size={18} color={colors.primaryLight} />
                <Text style={styles.joinCodeTitle}>Join with Code</Text>
              </View>
              <Text style={styles.joinCodeHint}>Enter into your taddler lobby and have fun!.</Text>
              <View style={styles.joinCodeRow}>
                <TextInput
                  value={joinCode}
                  onChangeText={(t) => setJoinCode(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
                  placeholder="e.g. A1B2C3D4"
                  placeholderTextColor={colors.text.muted}
                  style={styles.joinCodeInput}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={8}
                />
                <TouchableOpacity
                  style={[styles.joinCodeBtn, (!joinCode.trim() || joinCodeLoading) && styles.joinCodeBtnDim]}
                  onPress={() => joinByCode()}
                  disabled={!joinCode.trim() || joinCodeLoading}
                >
                  {joinCodeLoading
                    ? <StateBlock inline loading loaderSize={18} />
                    : <Text style={styles.joinCodeBtnText}>Join</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        )}

        {/* ── auto/practice/custom: slot size ── */}
        {step === "playerCount" && (
          <PlayerCountStep
            colors={colors} styles={styles} maxP={maxP}
            value={targetPlayers} onChange={(v) => setTargetPlayers(v)}
            isPractice={mode === "PRACTICE"}
            onProceed={proceedFromCount}
            roundsConfig={game?.rounds}
            selectedRounds={selectedRounds}
            onRoundsChange={setSelectedRounds}
          />
        )}

        {/* ── custom: lobby ── */}
        {step === "lobby" && (
          <LobbyStep
            colors={colors} styles={styles} game={game}
            lobbyCode={lobbyCode} lobbyMaxPlayers={lobbyMaxPlayers}
            displayPlayers={displayPlayers} filledCount={filledCount}
            allFilled={allFilled} maxP={maxP}
            lobbyAuto={lobbyAuto}
            followers={filteredFollowers} followersLoading={followersLoading}
            searchQuery={searchQuery} copyState={copyState}
            pendingInviteIds={pendingInviteIds}
            invitedAtMap={invitedAtMap}
            onSearchChange={setSearchQuery}
            onInviteFriend={inviteFriend}
            onRemovePlayer={removePlayer}
            onInviteBot={inviteBot}
            onChangeLobbySize={changeLobbySize}
            onToggleLobbyAuto={toggleLobbyAuto}
            onCopyCode={copyCode}
            onProceed={proceedFromLobby}
            roundsConfig={game?.rounds}
            selectedRounds={selectedRounds}
            onRoundsChange={setSelectedRounds}
          />
        )}

        {/* ── queue ── */}
        {step === "queue" && (
          <QueueStep
            colors={colors} styles={styles} mode={mode} game={game}
            phase={queuePhase} statusText={statusText}
            countdown={countdown} botFilling={botFilling}
            cancelling={cancelling} onCancel={cancelQueue}
            players={displayPlayers}
            initialCount={spawnBaseline}
            isTournament={!!initialTournamentId}
          />
        )}
      </View>
    </Modal>
  );
}


// ─── PlayerCountStep ──────────────────────────────────────────────────────────

// ─── PlayerCountStep (AUTO only) ─────────────────────────────────────────────

function PlayerCountStep({ colors, styles, maxP, value, onChange, isPractice, onProceed, roundsConfig, selectedRounds, onRoundsChange }: {
  colors: ColorPalette; styles: ReturnType<typeof makeStyles>;
  maxP: number;
  value: AutoSize;
  onChange: (v: AutoSize) => void;
  isPractice?: boolean;
  onProceed: () => void;
  roundsConfig?: { min: number; max: number; default: number };
  selectedRounds?: number;
  onRoundsChange?: (v: number) => void;
}) {
  const isAuto = value === "auto";
  const count  = isAuto ? maxP : (value as number);
  const rounds = selectedRounds ?? roundsConfig?.default ?? 1;
  const showRounds = roundsConfig && roundsConfig.max > 1;
  const ctaLabel = isPractice
    ? (isAuto ? "Start Practice" : `Practice with ${count} Players`)
    : (isAuto ? "Find Any Match" : `Find ${count}-Player Match`);

  return (
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionLabel}>How many players?</Text>
      <Text style={styles.sectionHint}>
        {isPractice
          ? "Bots will fill every seat for a solo practice match. Entry fee applies, no XP rewards."
          : "Auto joins any available match. Or pick a custom exact count."}
      </Text>

      {/* Auto / Custom toggle */}
      <View style={styles.countToggleRow}>
        <TouchableOpacity
          style={[styles.countToggleBtn, isAuto && styles.countToggleBtnActive]}
          onPress={() => onChange("auto")}
          activeOpacity={0.8}
        >
          <Ionicons
            name="shuffle"
            size={16}
            color={isAuto ? colors.primaryLight : colors.text.muted}
          />
          <Text style={[styles.countToggleText, isAuto && styles.countToggleTextActive]}>
            Auto
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.countToggleBtn, !isAuto && styles.countToggleBtnActive]}
          onPress={() => onChange(2)}
          activeOpacity={0.8}
        >
          <Ionicons
            name="options"
            size={16}
            color={!isAuto ? colors.primaryLight : colors.text.muted}
          />
          <Text style={[styles.countToggleText, !isAuto && styles.countToggleTextActive]}>
            Custom
          </Text>
        </TouchableOpacity>
      </View>

      {/* Custom count stepper */}
      {!isAuto && (
        <View style={styles.countStepperCard}>
          <TouchableOpacity
            style={[styles.countStepBtn, count <= 2 && styles.stepBtnDisabled]}
            onPress={() => onChange(Math.max(2, count - 1))}
            disabled={count <= 2}
          >
            <Ionicons name="remove" size={22} color={count <= 2 ? colors.text.muted : colors.primaryLight} />
          </TouchableOpacity>
          <View style={styles.countStepValueBox}>
            <Text style={styles.countStepNum}>{count}</Text>
            <Text style={styles.countStepLabel}>
              {count === 2 ? "1 v 1" : `${count} players`}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.countStepBtn, count >= maxP && styles.stepBtnDisabled]}
            onPress={() => onChange(Math.min(maxP, count + 1))}
            disabled={count >= maxP}
          >
            <Ionicons name="add" size={22} color={count >= maxP ? colors.text.muted : colors.primaryLight} />
          </TouchableOpacity>
        </View>
      )}

      {/* Rounds selector — only for multi-round games */}
      {showRounds && (
        <>
          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Rounds</Text>
          <Text style={styles.sectionHint}>Number of rounds per match.</Text>
          <View style={styles.countStepperCard}>
            <TouchableOpacity
              style={[styles.countStepBtn, rounds <= roundsConfig!.min && styles.stepBtnDisabled]}
              onPress={() => onRoundsChange?.(Math.max(roundsConfig!.min, rounds - 1))}
              disabled={rounds <= roundsConfig!.min}
            >
              <Ionicons name="remove" size={22} color={rounds <= roundsConfig!.min ? colors.text.muted : colors.primaryLight} />
            </TouchableOpacity>
            <View style={styles.countStepValueBox}>
              <Text style={styles.countStepNum}>{rounds}</Text>
              <Text style={styles.countStepLabel}>
                {rounds === 1 ? "1 round" : `${rounds} rounds`}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.countStepBtn, rounds >= roundsConfig!.max && styles.stepBtnDisabled]}
              onPress={() => onRoundsChange?.(Math.min(roundsConfig!.max, rounds + 1))}
              disabled={rounds >= roundsConfig!.max}
            >
              <Ionicons name="add" size={22} color={rounds >= roundsConfig!.max ? colors.text.muted : colors.primaryLight} />
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Auto description */}
      {isAuto && (
        <View style={styles.autoDescCard}>
          <Ionicons
            name={isPractice ? "fitness" : "sparkles-outline"}
            size={18}
            color={colors.primaryLight}
          />
          <Text style={styles.autoDescText}>
            {isPractice
              ? "Your private practice lobby is created instantly. Bots join to fill every open seat."
              : "You'll be placed into the first available match regardless of lobby size."}
          </Text>
        </View>
      )}

      <TouchableOpacity style={styles.ctaBtn} onPress={onProceed} activeOpacity={0.85}>
        <LinearGradient colors={[colors.primary, colors.cyanDark]} style={styles.ctaGradient}>
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );
}


/**
 * FriendCooldownRow — extracted from LobbyStep to satisfy Rules of Hooks.
 * Each row manages its own cooldown timer via useState + useEffect,
 * which is illegal inside a .map() callback.
 */
function FriendCooldownRow({
  person, isInLobby, isPending, lastInvite, allFilled, colors, styles, onInvite,
}: {
  person: any; isInLobby: boolean; isPending: boolean; lastInvite: number;
  allFilled: boolean; colors: ColorPalette; styles: ReturnType<typeof makeStyles>;
  onInvite: () => void;
}) {
  const COOLDOWN_MS = 5000;
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    if (!isPending || !lastInvite) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isPending, lastInvite]);
  const cooldownLeft = Math.max(0, Math.ceil((lastInvite + COOLDOWN_MS - now) / 1000));
  const canReinvite = isPending && !isInLobby && cooldownLeft === 0;

  return (
    <View style={styles.friendRow}>
      {person.avatar || person.profileImage
        ? <Image source={{ uri: person.avatar || person.profileImage }} style={styles.friendAvatar} />
        : <View style={styles.friendAvatarPh}>
            <Text style={styles.friendInitial}>{(person.name || "?")[0].toUpperCase()}</Text>
          </View>}
      <View style={{ flex: 1 }}>
        <Text style={styles.friendName} numberOfLines={1}>{person.name || person.username}</Text>
        {person.username ? <Text style={styles.friendHandle}>@{person.username}</Text> : null}
      </View>
      {isInLobby ? (
        <View style={styles.inLobbyPill}>
          <Ionicons name="checkmark" size={12} color={colors.success} />
          <Text style={[styles.inLobbyText, { color: colors.success }]}>In Lobby</Text>
        </View>
      ) : isPending && !canReinvite ? (
        <View style={[styles.inviteBtn, styles.inviteBtnDim]}>
          <Text style={[styles.inviteBtnText, { color: colors.text.muted }]}>
            {cooldownLeft > 0 ? "Invited" : "Waiting..."}
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.inviteBtn, allFilled && styles.inviteBtnDim]}
          onPress={() => !allFilled && onInvite()}
          disabled={allFilled}
        >
          <Text style={styles.inviteBtnText}>
            {canReinvite ? "Resend" : "Invite"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── LobbyStep ────────────────────────────────────────────────────────────────

const RING_RADIUS = 100; // px from center to slot center
const SLOT_SIZE  = 64;

/**
 * Circular slot ring showing filled + open slots. Reused on the lobby screen
 * (editable) and the matchmaking queue screen (bots appear in the ring as the
 * server fills the lobby gradually, one at a time).
 */
function SlotRing({
  colors, styles, players, totalSlots,
  onRemovePlayer,
}: {
  colors: ColorPalette; styles: ReturnType<typeof makeStyles>;
  players: any[]; totalSlots: number;
  onRemovePlayer?: (id: string) => void;
}) {
  // Invited friends are placeholders — NOT onboarded until they accept, so they
  // NEVER occupy a ring slot (first come, first serve). They render in the
  // "Pending Invites" list below the ring instead; anyone who joins first takes
  // an open seat.
  const joined = players.filter((p) => p._status !== "invited").slice(0, totalSlots);
  const filledCount = joined.length;
  const emptyCount = Math.max(0, totalSlots - joined.length);
  const slots: Array<
    | { kind: "joined"; player: any }
    | { kind: "empty"; index: number }
  > = [
    ...joined.map((p) => ({ kind: "joined" as const, player: p })),
    ...Array.from({ length: emptyCount }, (_, i) => ({ kind: "empty" as const, index: i })),
  ];

  const positions = circlePositions(totalSlots, RING_RADIUS);
  const ringSize = (RING_RADIUS + SLOT_SIZE / 2 + 8) * 2;

  return (
    <View style={[styles.ringContainer, { width: ringSize, height: ringSize }]}>
      {/* Dashed ring outline */}
      <View style={[styles.ringCircle, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }]} />
      {/* Center label */}
      <View style={styles.ringCenter}>
        <Text style={styles.ringCenterNum}>{filledCount}/{totalSlots}</Text>
        <Text style={styles.ringCenterLabel}>Players</Text>
      </View>
      {/* Slots */}
      {slots.map((slot, i) => {
        const pos = positions[i] ?? { x: 0, y: 0 };
        const left = ringSize / 2 + pos.x - SLOT_SIZE / 2;
        const top  = ringSize / 2 + pos.y - SLOT_SIZE / 2;
        if (slot.kind === "joined") {
          const p = slot.player;
          const isHost = p._status === "host";
          const isBot  = p._status === "bot";
          const playerId = pid(p);
          return (
            <View key={playerId} style={[styles.ringSlot, { left, top, width: SLOT_SIZE, height: SLOT_SIZE }]}>
              {p.avatar
                ? <Image source={{ uri: p.avatar }} style={styles.ringAvatar} />
                : <LinearGradient
                    colors={isBot ? ["#334155", "#1E293B"] : [colors.primary, colors.cyanDark]}
                    style={styles.ringAvatarGrad}
                  >
                    <Text style={styles.ringAvatarInitial}>
                      {isBot ? "🤖" : (p.name || "?")[0].toUpperCase()}
                    </Text>
                  </LinearGradient>}
              {/* Name tag */}
              <View style={styles.ringNameTag}>
                <Text style={styles.ringName} numberOfLines={1}>
                  {isHost ? "You" : isBot ? "Bot" : (p.name || p.username || "?")}
                </Text>
              </View>
              {/* Status badges */}
              {isHost && (
                <View style={[styles.ringBadge, { backgroundColor: "#F59E0B" }]}>
                  <Text style={styles.ringBadgeText}>👑</Text>
                </View>
              )}
              {/* Remove button (non-host) */}
              {!isHost && onRemovePlayer && (
                <TouchableOpacity
                  style={styles.ringRemove}
                  onPress={() => onRemovePlayer(playerId)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="close-circle" size={16} color={colors.danger} />
                </TouchableOpacity>
              )}
            </View>
          );
        }
        return (
          <View key={`empty-${slot.index}`} style={[styles.ringSlot, styles.ringSlotEmpty, { left, top, width: SLOT_SIZE, height: SLOT_SIZE }]}>
            <Ionicons name="person-add-outline" size={22} color={colors.text.muted} />
            <Text style={styles.ringEmptyLabel}>Open</Text>
          </View>
        );
      })}
    </View>
  );
}

function LobbyStep({
  colors, styles, game, lobbyCode, lobbyMaxPlayers, displayPlayers,
  filledCount, allFilled, maxP, lobbyAuto, followers, followersLoading, searchQuery,
  copyState, pendingInviteIds, invitedAtMap, onSearchChange, onInviteFriend,
  onRemovePlayer, onInviteBot, onChangeLobbySize, onToggleLobbyAuto,
  onCopyCode, onProceed, roundsConfig, selectedRounds, onRoundsChange,
}: {
  colors: ColorPalette; styles: ReturnType<typeof makeStyles>; game: Game;
  lobbyCode: string; lobbyMaxPlayers: number; displayPlayers: any[];
  filledCount: number; allFilled: boolean; maxP: number;
  lobbyAuto: boolean;
  followers: any[]; followersLoading: boolean; searchQuery: string;
  copyState: string; pendingInviteIds: string[];
  invitedAtMap: Record<string, number>;
  onSearchChange: (s: string) => void;
  onInviteFriend: (p: any) => void;
  onRemovePlayer: (id: string) => void;
  onInviteBot: () => void;
  onChangeLobbySize: (n: number) => void;
  onToggleLobbyAuto: (auto: boolean) => void;
  onCopyCode: () => void;
  onProceed: () => void;
  roundsConfig?: { min: number; max: number; default: number };
  selectedRounds?: number;
  onRoundsChange?: (v: number) => void;
}) {
  const totalSlots = lobbyMaxPlayers;
  const rounds = selectedRounds ?? roundsConfig?.default ?? 1;
  const showRounds = roundsConfig && roundsConfig.max > 1;

  return (
    <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 100 }]} showsVerticalScrollIndicator={false}>

      {/* ── Lobby code card ── */}
      <View style={styles.codeCard}>
        <View style={styles.codeTopRow}>
          <View>
            <Text style={styles.codeEyebrow}>Lobby Code</Text>
            <Text style={styles.codeText}>{lobbyCode}</Text>
          </View>
          <TouchableOpacity style={styles.copyBtn} onPress={onCopyCode}>
            <Ionicons name="copy-outline" size={15} color={colors.primaryLight} />
            <Text style={styles.copyBtnText}>{copyState}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.codeHint}>Share this code so friends can join your lobby.</Text>
      </View>

      {/* ── Slot count — auto/custom selector lives here (no separate step) ── */}
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Slots</Text>
        {/* Auto / Custom toggle */}
        <View style={styles.countToggleRow}>
          <TouchableOpacity
            style={[styles.countToggleBtn, lobbyAuto && styles.countToggleBtnActive]}
            onPress={() => onToggleLobbyAuto(true)}
            activeOpacity={0.8}
          >
            <Ionicons
              name="shuffle"
              size={16}
              color={lobbyAuto ? colors.primaryLight : colors.text.muted}
            />
            <Text style={[styles.countToggleText, lobbyAuto && styles.countToggleTextActive]}>
              Auto
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.countToggleBtn, !lobbyAuto && styles.countToggleBtnActive]}
            onPress={() => onToggleLobbyAuto(false)}
            activeOpacity={0.8}
          >
            <Ionicons
              name="options"
              size={16}
              color={!lobbyAuto ? colors.primaryLight : colors.text.muted}
            />
            <Text style={[styles.countToggleText, !lobbyAuto && styles.countToggleTextActive]}>
              Custom
            </Text>
          </TouchableOpacity>
        </View>
        {/* Auto selection is enough — no stepper / count when Auto is on */}
        {!lobbyAuto && (
          <View style={styles.rowBetween}>
            <Text style={styles.slotCountText}>{filledCount} / {lobbyMaxPlayers} filled</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={[styles.stepBtn, lobbyMaxPlayers <= 2 && styles.stepBtnDisabled]}
                onPress={() => onChangeLobbySize(Math.max(2, lobbyMaxPlayers - 1))}
                disabled={lobbyMaxPlayers <= 2}
              >
                <Ionicons name="remove" size={16} color={lobbyMaxPlayers <= 2 ? colors.text.muted : colors.primaryLight} />
              </TouchableOpacity>
              <Text style={styles.stepVal}>{lobbyMaxPlayers}</Text>
              <TouchableOpacity
                style={[styles.stepBtn, lobbyMaxPlayers >= maxP && styles.stepBtnDisabled]}
                onPress={() => onChangeLobbySize(Math.min(maxP, lobbyMaxPlayers + 1))}
                disabled={lobbyMaxPlayers >= maxP}
              >
                <Ionicons name="add" size={16} color={lobbyMaxPlayers >= maxP ? colors.text.muted : colors.primaryLight} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        {lobbyAuto && (
          <Text style={styles.slotAutoHint}>
            Auto opens the lobby at the game's max size ({maxP} slots).
          </Text>
        )}
      </View>

      {/* ── Rounds selector ── */}
      {showRounds && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Rounds</Text>
          <Text style={styles.panelHint}>Number of rounds per match.</Text>
          <View style={styles.rowBetween}>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={[styles.stepBtn, rounds <= roundsConfig!.min && styles.stepBtnDisabled]}
                onPress={() => onRoundsChange?.(Math.max(roundsConfig!.min, rounds - 1))}
                disabled={rounds <= roundsConfig!.min}
              >
                <Ionicons name="remove" size={16} color={rounds <= roundsConfig!.min ? colors.text.muted : colors.primaryLight} />
              </TouchableOpacity>
              <Text style={styles.stepVal}>{rounds}</Text>
              <TouchableOpacity
                style={[styles.stepBtn, rounds >= roundsConfig!.max && styles.stepBtnDisabled]}
                onPress={() => onRoundsChange?.(Math.min(roundsConfig!.max, rounds + 1))}
                disabled={rounds >= roundsConfig!.max}
              >
                <Ionicons name="add" size={16} color={rounds >= roundsConfig!.max ? colors.text.muted : colors.primaryLight} />
              </TouchableOpacity>
            </View>
            <Text style={styles.slotCountText}>
              {rounds === 1 ? '1 round' : `${rounds} rounds`}
            </Text>
          </View>
        </View>
      )}

      {/* ── Circular slot ring ── */}
      <SlotRing
        colors={colors}
        styles={styles}
        players={displayPlayers}
        totalSlots={totalSlots}
        onRemovePlayer={onRemovePlayer}
      />

      {/* ── Invite / bot actions ── */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.botBtn} onPress={onInviteBot} disabled={allFilled}>
          <Ionicons name="hardware-chip-outline" size={15} color={allFilled ? colors.text.muted : colors.primaryLight} />
          <Text style={[styles.botBtnText, allFilled && { color: colors.text.muted }]}>Add Bot</Text>
        </TouchableOpacity>
      </View>


      {/* ── Invite friends ── */}
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Invite Friends</Text>
        <TextInput
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder="Search mutual followers..."
          placeholderTextColor={colors.text.muted}
          style={styles.searchInput}
        />
        {followersLoading && (
          <StateBlock inline loading style={{ marginTop: 12 }} />
        )}
        {!followersLoading && followers.length === 0 && (
          <Text style={styles.emptyText}>No mutual followers found.</Text>
        )}
        {followers.map((person: any) => (
          <FriendCooldownRow
            key={pid(person)}
            person={person}
            isInLobby={displayPlayers.some((p: any) => pid(p) === pid(person) && p._status !== "invited")}
            isPending={pendingInviteIds.includes(pid(person))}
            lastInvite={invitedAtMap[pid(person)] || 0}
            allFilled={allFilled}
            colors={colors}
            styles={styles}
            onInvite={() => onInviteFriend(person)}
          />
        ))}
      </View>

      {/* ── CTA ── */}
      <TouchableOpacity style={styles.ctaBtn} onPress={onProceed} activeOpacity={0.85}>
        <LinearGradient colors={[colors.primary, colors.cyanDark]} style={styles.ctaGradient}>
          <Text style={styles.ctaText}>{allFilled ? "Start Match" : "Auto Match & Proceed"}</Text>
        </LinearGradient>
      </TouchableOpacity>
      {!allFilled && (
        <Text style={styles.ctaHint}>Empty slots will be filled with opponents or bots.</Text>
      )}
    </ScrollView>
  );
}


// ─── QueueStep ────────────────────────────────────────────────────────────────

function QueueStep({ colors, styles, mode, game, phase, statusText, countdown, botFilling, cancelling, onCancel, players, initialCount = 1, isTournament = false }: {
  colors: ColorPalette; styles: ReturnType<typeof makeStyles>;
  mode: MatchMode; game: Game;
  phase: "searching" | "filling" | "matched";
  statusText: string; countdown: number | null;
  botFilling: boolean; cancelling: boolean;
  onCancel: () => void;
  players?: any[]; initialCount?: number;
  isTournament?: boolean;
}) {
  return (
    <View style={{ flex: 1 }}>
      {/* Centered radar with game identity above it */}
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingBottom: 16 }}>
        {/* Game logo above name, stacked vertically — pushed up from radar */}
        <View style={{ alignItems: "center", marginBottom: 20 }}>
          <GameLogo game={game} size={36} radius={10} />
          <Text style={{ color: "#F8FAFC", fontSize: 15, fontWeight: "800", marginTop: 8 }}>{game.name}</Text>
        </View>
        <MatchmakingRadar colors={colors} isActive={phase !== "matched"} players={players || []} initialCount={initialCount} />
      </View>

      {/* Bottom section: status + info + cancel */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        {/* Mode pill + countdown */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <View style={[styles.modePill, isTournament && { backgroundColor: "rgba(251,191,36,0.12)", borderColor: "rgba(251,191,36,0.35)" }]}>
            <Text style={[styles.modePillText, isTournament && { color: "#FBBF24" }]}>
              {isTournament ? "TOURNAMENT" : mode === "AUTO" ? "AUTO MATCH" : mode === "PRACTICE" ? "PRACTICE" : "CUSTOM LOBBY"}
            </Text>
          </View>
          {countdown !== null && phase === "searching" && !botFilling && !isTournament && (
            <View style={styles.timerPill}>
              <Ionicons name="time-outline" size={13} color={colors.primaryLight} />
              <Text style={styles.timerText}>{countdown}s</Text>
            </View>
          )}
        </View>
        {/* Status text */}
        <Text style={[styles.queueTitle, { marginBottom: 4, textAlign: "center" }]}>
          {phase === "matched"
            ? "Match Found!"
            : isTournament
              ? "Hold On!"
              : phase === "filling"
                ? "Setting up match..."
                : "Finding your match"}
        </Text>
        <Text style={[styles.queueStatus, { textAlign: "center", marginBottom: 14 }]}>{statusText}</Text>
        {/* Cancel button */}
        <TouchableOpacity
          onPress={onCancel}
          disabled={cancelling}
          style={{ alignSelf: "center", backgroundColor: "rgba(239,68,68,0.12)", paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: "rgba(239,68,68,0.25)" }}
        >
          <Text style={{ color: "#EF4444", fontSize: 13, fontWeight: "700" }}>
            {cancelling ? "Cancelling..." : "Cancel"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Radar ────────────────────────────────────────────────────────────────────

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function radarSpot(id: string): { x: number; y: number } {
  const h = hashStr(id || "x");
  const angle  = (h % 360) * (Math.PI / 180);
  // Centre icon is 52px diameter (radius 26px) + pin is 36px (radius 18px)
  // so minimum safe radius is 26 + 18 + 10 (gap) = 54px.
  // Disc radius is 130px; pin radius 18px + name-tag ~32px overhead leaves ~80px max.
  const radius = 58 + ((h >> 4) % 38);   // 58 – 95 px from centre
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

const MatchmakingRadar = React.memo(function MatchmakingRadar({
  colors,
  isActive,
  players = [],
  initialCount = 1,
}: {
  colors: ColorPalette;
  isActive: boolean;
  players?: any[];
  initialCount?: number;
}) {
  const sweep   = useRef(new Animated.Value(0)).current;
  const pulse   = useRef(new Animated.Value(0)).current;
  const ripple1 = useRef(new Animated.Value(0)).current;
  const ripple2 = useRef(new Animated.Value(0)).current;
  // The radar centre is the animated app logo; falls back to the cross-hair
  // dot until the .lottie is cached.
  const [lottieSource, setLottieSource] = useState<any>(
    getCachedLottieSync(S3_APP_ICON_LOTTIE_URL),
  );
  useEffect(() => {
    getCachedLottie(S3_APP_ICON_LOTTIE_URL).then((animData) => {
      if (animData) setLottieSource(animData);
    });
  }, []);

  useEffect(() => {
    if (!isActive) {
      [sweep, pulse, ripple1, ripple2].forEach(a => a.stopAnimation());
      return;
    }
    // Sweep beam rotation
    const sweepAnim = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 2800, easing: Easing.linear, useNativeDriver: true }),
    );
    // Centre glow pulse
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ]),
    );
    // Two offset ripple rings expanding from centre
    const makeRipple = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      );
    sweepAnim.start();
    pulseAnim.start();
    makeRipple(ripple1, 0).start();
    makeRipple(ripple2, 1100).start();
    return () => [sweepAnim, pulseAnim].forEach(a => a.stop());
  }, [isActive]);

  const sweepDeg = sweep.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const centreOp = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

  const pins = players.filter((p) => p._status !== "invited");
  const DISC   = 260;
  const CENTER = DISC / 2;   // 130

  const pinDelay = (i: number) =>
    i < initialCount ? 0 : Math.min((i - initialCount + 1) * 320, 2000);

  return (
    <View style={{ alignItems: "center", marginBottom: 8 }}>
      {/*
        Two-layer approach:
        1. clipDisc  — clips the sweep beam to the circle (overflow:hidden)
        2. pinLayer  — sits on top, overflow:visible, so name tags don't get clipped
      */}
      <View style={{ width: DISC, height: DISC }}>

        {/* ── Layer 1: disc + rings + sweep beam (clipped to circle) ── */}
        <View style={{
          position: "absolute", width: DISC, height: DISC, borderRadius: DISC / 2,
          backgroundColor: "#040910",
          borderWidth: 1.5, borderColor: colors.primaryLight + "38",
          overflow: "hidden",
        }}>
          {/* Concentric rings */}
          {[200, 150, 100, 56].map((d) => (
            <View key={d} style={{
              position: "absolute",
              left: CENTER - d / 2, top: CENTER - d / 2,
              width: d, height: d, borderRadius: d / 2,
              borderWidth: 1, borderColor: colors.primaryLight + "1A",
            }} />
          ))}

          {/* Sweep beam — clipped inside disc */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute", width: DISC, height: DISC,
              transform: [{ rotate: sweepDeg }],
            }}
          >
            {/* Trailing glow wedge */}
            <LinearGradient
              colors={[colors.primaryLight + "00", colors.primaryLight + "33", colors.primaryLight + "08"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{
                position: "absolute",
                left: CENTER, top: 0,
                width: CENTER, height: DISC,
              }}
            />
            {/* Sharp leading edge */}
            <View style={{
              position: "absolute", left: CENTER, top: 0,
              width: 1.5, height: CENTER,
              backgroundColor: colors.primaryLight + "CC",
            }} />
          </Animated.View>
        </View>

        {/* ── Layer 2: ripple rings + centre icon (not clipped) ── */}
        <View style={{
          position: "absolute", width: DISC, height: DISC,
          alignItems: "center", justifyContent: "center",
        }} pointerEvents="none">
          {/* Ripple 1 */}
          <Animated.View style={{
            position: "absolute",
            width: 64, height: 64, borderRadius: 32,
            borderWidth: 1.5, borderColor: colors.primaryLight,
            opacity: ripple1.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.7, 0.2, 0] }),
            transform: [{ scale: ripple1.interpolate({ inputRange: [0, 1], outputRange: [1, 3.2] }) }],
          }} />
          {/* Ripple 2 */}
          <Animated.View style={{
            position: "absolute",
            width: 64, height: 64, borderRadius: 32,
            borderWidth: 1.5, borderColor: colors.primaryLight,
            opacity: ripple2.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.7, 0.2, 0] }),
            transform: [{ scale: ripple2.interpolate({ inputRange: [0, 1], outputRange: [1, 3.2] }) }],
          }} />

          {/* Centre — the animated app logo (cross-hair dot while the
              .lottie isn't cached yet). Clipped to the circle via the logo's
              own borderRadius so the parent's glow shadow isn't cut off. */}
          <Animated.View style={{
            width: 52, height: 52, borderRadius: 26,
            backgroundColor: colors.bg.elevated,
            borderWidth: 2, borderColor: colors.primaryLight,
            alignItems: "center", justifyContent: "center",
            shadowColor: colors.primaryLight, shadowOpacity: 0.6, shadowRadius: 12,
            elevation: 6,
            opacity: centreOp,
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.04] }) }],
          }}>
            {lottieSource ? (
              <View style={{ width: "100%", height: "100%", borderRadius: 24, overflow: "hidden" }}>
                <LottieView
                  source={lottieSource}
                  autoPlay
                  loop
                  cacheComposition={false}
                  resizeMode="cover"
                  style={{ width: "100%", height: "100%" }}
                />
              </View>
            ) : (
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primaryLight }} />
            )}
          </Animated.View>
        </View>

        {/* ── Layer 3: player pins — overflow visible so name tags show ── */}
        <View style={{
          position: "absolute", width: DISC, height: DISC,
        }}>
          {pins.slice(0, 8).map((p, i) => {
            const id = p.id || p.userId || String(i);
            const spot = radarSpot(id);
            return (
              <RadarPin
                key={id}
                colors={colors}
                player={p}
                x={CENTER + spot.x}
                y={CENTER + spot.y}
                delay={pinDelay(i)}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
});

function RadarPin({
  colors, player, x, y, delay = 0,
}: {
  colors: ColorPalette; player: any; x: number; y: number; delay?: number;
}) {
  const scale = useRef(new Animated.Value(0)).current;
  const fade  = useRef(new Animated.Value(0)).current;
  const ping  = useRef(new Animated.Value(0)).current;
  const bob   = useRef(new Animated.Value(0)).current;
  const delayRef = useRef(delay);

  useEffect(() => {
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
        Animated.timing(fade,  { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(ping,  { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(bob, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(bob, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ).start();
    }, delayRef.current);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isBot  = player.isBot || String(player.id || player.userId || "").startsWith("bot_");
  const isHost = player._status === "host";
  const name   = isHost
    ? "You"
    : (player.name || player.displayName || player.username || (isBot ? "Bot" : "?"));
  const avatar = player.avatar || player.avatarUrl;
  const PIN    = 36;

  const pinColor = isBot ? colors.text.muted : colors.primaryLight;

  return (
    <Animated.View style={{
      position: "absolute",
      // Centre the pin on x,y
      left: x - PIN / 2 - 52, // 52 = half of name tag max width (104/2)
      top:  y - PIN / 2 - 32, // 32 = name tag height + caret
      width: PIN + 104,        // wide enough for name tag
      alignItems: "center",
      opacity: fade,
      transform: [
        { scale },
        { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) },
      ],
    }}>
      {/* Name tag */}
      <View style={{
        backgroundColor: "rgba(2,6,20,0.95)",
        borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
        borderWidth: 1,
        borderColor: isBot ? colors.text.muted + "40" : colors.primaryLight + "60",
        alignSelf: "center",
        marginBottom: 4,
        maxWidth: 110,
      }}>
        <Text style={{
          color: isBot ? colors.text.muted : "#F8FAFC",
          fontSize: 10, fontWeight: "800",
          textAlign: "center",
        }} numberOfLines={1} ellipsizeMode="tail">
          {name}
        </Text>
      </View>

      {/* Caret connector */}
      <View style={{
        width: 0, height: 0, marginBottom: 1,
        borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 4,
        borderLeftColor: "transparent", borderRightColor: "transparent",
        borderTopColor: isBot ? colors.text.muted + "40" : colors.primaryLight + "60",
      }} />

      {/* Pin disc */}
      <View style={{ alignItems: "center", justifyContent: "center" }}>
        {/* Sonar ping */}
        <Animated.View style={{
          position: "absolute",
          width: PIN, height: PIN, borderRadius: PIN / 2,
          borderWidth: 2, borderColor: pinColor,
          opacity: ping.interpolate({ inputRange: [0, 1], outputRange: [0.85, 0] }),
          transform: [{ scale: ping.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
        }} />

        {avatar ? (
          <Image source={{ uri: avatar }} style={{
            width: PIN, height: PIN, borderRadius: PIN / 2,
            borderWidth: 2.5, borderColor: pinColor,
          }} />
        ) : (
          <LinearGradient
            colors={
              isBot
                ? [colors.bg.elevated, colors.bg.surface]
                : isHost
                  ? ["#F59E0B", "#D97706"]
                  : [colors.primary, colors.cyanDark]
            }
            style={{
              width: PIN, height: PIN, borderRadius: PIN / 2,
              borderWidth: 2.5, borderColor: pinColor,
              alignItems: "center", justifyContent: "center",
            }}
          >
            <Text style={{ color: isBot ? colors.text.muted : "#fff", fontSize: 14, fontWeight: "900" }}>
              {isBot ? "🤖" : (name[0] || "?").toUpperCase()}
            </Text>
          </LinearGradient>
        )}
      </View>
    </Animated.View>
  );
}


// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    root:       { flex: 1, backgroundColor: c.bg.base },
    header:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: c.border },
    headerBtn:  { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
    headerTitle:{ fontSize: fontSizes.lg, fontWeight: "700", color: c.text.primary },
    body:       { padding: spacing.lg, paddingBottom: 80 },

    // select
    sectionLabel: { fontSize: fontSizes.md, fontWeight: "700", color: c.text.primary, marginBottom: 6 },
    sectionHint:  { fontSize: fontSizes.sm, color: c.text.secondary, marginBottom: spacing.lg, lineHeight: 20 },
    modeCard:     { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.bg.card, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border, padding: spacing.md, marginBottom: spacing.md },
    modeIconCircle: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
    modeTitle:    { fontSize: fontSizes.md, fontWeight: "700", color: c.text.primary, marginBottom: 3 },
    modeDesc:     { fontSize: fontSizes.sm, color: c.text.secondary, lineHeight: 18 },

    // player count step — toggle + stepper
    countToggleRow:      { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
    countToggleBtn:      { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 12, borderRadius: radii.lg, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.bg.card },
    countToggleBtnActive:{ borderColor: c.primaryLight, backgroundColor: c.bg.elevated },
    countToggleText:     { fontSize: fontSizes.md, fontWeight: "700", color: c.text.muted },
    countToggleTextActive:{ color: c.primaryLight },
    countStepperCard:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: c.bg.card, borderRadius: radii.xl, borderWidth: 1, borderColor: c.border, padding: spacing.lg, marginBottom: spacing.lg },
    countStepBtn:        { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: c.primaryLight, alignItems: "center", justifyContent: "center", backgroundColor: c.bg.elevated },
    countStepValueBox:   { alignItems: "center", justifyContent: "center" },
    countStepNum:        { fontSize: 48, fontWeight: "900", color: c.text.primary, lineHeight: 56 },
    countStepLabel:      { fontSize: fontSizes.sm, color: c.text.muted, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.8 },
    autoDescCard:        { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: c.bg.elevated, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border, padding: spacing.md, marginBottom: spacing.lg },
    autoDescText:        { flex: 1, fontSize: fontSizes.sm, color: c.text.secondary, lineHeight: 20 },

    // join by code card (select screen)
    joinCodeCard:        { backgroundColor: c.bg.card, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border, padding: spacing.md, marginTop: spacing.sm },
    joinCodeHeader:      { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
    joinCodeTitle:       { fontSize: fontSizes.md, fontWeight: "700", color: c.text.primary },
    joinCodeHint:        { fontSize: fontSizes.sm, color: c.text.secondary, marginBottom: spacing.md, lineHeight: 18 },
    joinCodeRow:         { flexDirection: "row", gap: spacing.sm },
    joinCodeInput:       { flex: 1, backgroundColor: c.bg.elevated, borderWidth: 1, borderColor: c.border, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: 12, color: c.text.primary, fontSize: fontSizes.md, fontWeight: "700", letterSpacing: 2 },
    joinCodeBtn:         { paddingHorizontal: spacing.lg, paddingVertical: 12, backgroundColor: c.primaryLight, borderRadius: radii.md, alignItems: "center", justifyContent: "center", minWidth: 72 },
    joinCodeBtnDim:      { backgroundColor: c.bg.elevated, borderWidth: 1, borderColor: c.border },
    joinCodeBtnText:     { color: "#fff", fontSize: fontSizes.md, fontWeight: "700" },

    // shared cta
    ctaBtn:     { height: 54, borderRadius: radii.full, overflow: "hidden", marginTop: spacing.lg },
    ctaGradient:{ flex: 1, alignItems: "center", justifyContent: "center" },
    ctaText:    { color: "#fff", fontSize: fontSizes.md, fontWeight: "700" },
    ctaHint:    { textAlign: "center", color: c.text.muted, fontSize: fontSizes.sm, marginTop: spacing.sm },

    // lobby code card
    codeCard:    { backgroundColor: c.bg.card, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border, padding: spacing.md, marginBottom: spacing.md },
    codeTopRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    codeEyebrow: { fontSize: fontSizes.xs, fontWeight: "700", color: c.text.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
    codeText:    { fontSize: 26, fontWeight: "900", color: c.text.primary, letterSpacing: 3 },
    copyBtn:     { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: spacing.md, paddingVertical: 8, backgroundColor: c.bg.elevated, borderRadius: radii.md, borderWidth: 1, borderColor: c.border },
    copyBtnText: { color: c.primaryLight, fontSize: fontSizes.sm, fontWeight: "700" },
    codeHint:    { color: c.text.muted, fontSize: fontSizes.xs, marginTop: 6 },

    // panel
    panel:       { backgroundColor: c.bg.card, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border, padding: spacing.md, marginBottom: spacing.md },
    panelTitle:  { fontSize: fontSizes.md, fontWeight: "700", color: c.text.primary, marginBottom: 4 },
    panelHint:   { fontSize: fontSizes.sm, color: c.text.muted, marginBottom: spacing.sm },
    rowBetween:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    stepper:     { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    stepBtn:     { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", backgroundColor: c.bg.elevated },
    stepBtnDisabled: { opacity: 0.4 },
    stepVal:     { minWidth: 28, textAlign: "center", fontSize: fontSizes.md, fontWeight: "700", color: c.text.primary },
    slotCountText: { color: c.text.muted, fontSize: fontSizes.xs, marginTop: 4 },
    slotAutoHint:  { color: c.text.muted, fontSize: fontSizes.xs, marginTop: 8, lineHeight: 16 },

    // circular ring
    ringContainer: { alignSelf: "center", alignItems: "center", justifyContent: "center", marginBottom: spacing.md, position: "relative" },
    ringCircle:    { position: "absolute", borderWidth: 1, borderColor: c.border, borderStyle: "dashed", opacity: 0.5 },
    ringCenter:    { position: "absolute", alignItems: "center", justifyContent: "center" },
    ringCenterNum: { fontSize: fontSizes.lg, fontWeight: "800", color: c.text.primary },
    ringCenterLabel: { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.8 },
    ringSlot:      { position: "absolute", alignItems: "center", justifyContent: "center", borderRadius: SLOT_SIZE / 2 },
    ringSlotEmpty: { borderWidth: 1.5, borderColor: c.border, borderStyle: "dashed", backgroundColor: c.bg.elevated },
    ringAvatar:    { width: SLOT_SIZE, height: SLOT_SIZE, borderRadius: SLOT_SIZE / 2, borderWidth: 2, borderColor: c.primaryLight },
    ringAvatarGrad:{ width: SLOT_SIZE, height: SLOT_SIZE, borderRadius: SLOT_SIZE / 2, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.primaryLight },
    ringAvatarInitial: { color: "#fff", fontSize: fontSizes.lg, fontWeight: "700" },
    ringNameTag:   { position: "absolute", bottom: -18, backgroundColor: c.bg.elevated, borderRadius: radii.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: c.border, maxWidth: 72 },
    ringName:      { color: c.text.primary, fontSize: 9, fontWeight: "700", textAlign: "center" },
    ringBadge:     { position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
    ringBadgeText: { fontSize: 9 },
    ringRemove:    { position: "absolute", top: -4, left: -4 },
    ringEmptyLabel:{ color: c.text.muted, fontSize: 9, fontWeight: "600", textTransform: "uppercase", marginTop: 2 },

    // action row above invite panel
    actionRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
    botBtn:    { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: 9, backgroundColor: c.bg.card, borderRadius: radii.full, borderWidth: 1, borderColor: c.border },
    botBtnText:{ color: c.primaryLight, fontSize: fontSizes.sm, fontWeight: "700" },

    // invite friends
    searchInput:  { backgroundColor: c.bg.elevated, borderWidth: 1, borderColor: c.border, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: 10, color: c.text.primary, marginTop: spacing.sm, marginBottom: 4 },
    emptyText:    { color: c.text.muted, fontSize: fontSizes.sm, paddingVertical: 12 },
    friendRow:    { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border + "40" },
    friendAvatar: { width: 40, height: 40, borderRadius: 20 },
    friendAvatarPh:{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.bg.elevated, alignItems: "center", justifyContent: "center" },
    friendInitial:{ color: c.text.primary, fontWeight: "700" },
    friendName:   { color: c.text.primary, fontWeight: "600", fontSize: fontSizes.sm },
    friendHandle: { color: c.text.muted, fontSize: fontSizes.xs, marginTop: 1 },
    inviteBtn:    { paddingHorizontal: spacing.md, paddingVertical: 7, backgroundColor: c.primaryLight, borderRadius: radii.full },
    inviteBtnDim: { backgroundColor: c.bg.elevated, borderWidth: 1, borderColor: c.border },
    inviteBtnText:{ color: "#fff", fontSize: fontSizes.xs, fontWeight: "700" },
    inLobbyPill:  { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6 },
    inLobbyText:  { fontSize: fontSizes.xs, fontWeight: "700" },

    // queue
    queueCard:   { backgroundColor: c.bg.card, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg, marginBottom: spacing.md },
    modePill:    { paddingHorizontal: spacing.md, paddingVertical: 5, backgroundColor: c.bg.elevated, borderRadius: radii.full },
    modePillText:{ color: c.primaryLight, fontSize: fontSizes.xs, fontWeight: "700", letterSpacing: 1 },
    timerPill:   { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: c.bg.elevated, paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radii.full },
    timerText:   { color: c.text.primary, fontWeight: "700", fontSize: fontSizes.sm },
    queueTitle:  { fontSize: fontSizes.lg, fontWeight: "700", color: c.text.primary, marginTop: spacing.sm },
    queueGame:   { fontSize: fontSizes.sm, color: c.text.secondary, marginTop: 4 },
    queueStatus: { fontSize: fontSizes.sm, color: c.text.secondary, marginTop: spacing.sm, lineHeight: 20 },
    cancelBtn:   { marginTop: spacing.sm, height: 52, borderRadius: radii.full, backgroundColor: c.bg.card, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
    cancelText:  { color: c.text.secondary, fontWeight: "700", fontSize: fontSizes.md },
  });
}
