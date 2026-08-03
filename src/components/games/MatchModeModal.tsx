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
  ActivityIndicator,
  Alert,
  Animated,
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
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { useThemeColors } from "../../context/ThemeContext";
import { apiClient } from "../../services/apiClient";
import { gamesService, type MatchmakingResponse } from "../../services/games.service";
import { socketClient } from "../../services/socketClient";
import { userService } from "../../services/user.service";
import { fontSizes, radii, spacing, type ColorPalette } from "../../theme";
import type { Game } from "../../types";

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
  if (!game) return 4;
  if (game.slug === "ludo" || game.slug === "snake-ladder") return 4;
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

  // ── auto / shared ─────────────────────────────────────────────────────────
  const [targetPlayers, setTargetPlayers] = useState<AutoSize>("auto");

  // ── invite-code join ──────────────────────────────────────────────────────
  const [joinCode, setJoinCode] = useState("");
  const [joinCodeLoading, setJoinCodeLoading] = useState(false);

  // ── lobby (CUSTOM) ────────────────────────────────────────────────────────
  const [lobbyLoading, setLobbyLoading] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState<any[]>([]);
  const [lobbyMaxPlayers, setLobbyMaxPlayers] = useState<number>(2);
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
  // Rematch: auto-queue fired exactly once per modal open (guarded so the
  // socket-listeners effect + remounts can never double-join matchmaking).
  const autoQueuedRef = useRef(false);

  // ── reset ─────────────────────────────────────────────────────────────────
  useEffect(() => { if (!visible) _reset(); }, [visible]);

  function _reset() {
    autoQueuedRef.current = false;
    setMode("AUTO"); setStep("select"); setTargetPlayers("auto");
    setJoinCode(""); setJoinCodeLoading(false);
    setLobbyLoading(false); setLobbyPlayers([]); setLobbyMaxPlayers(2);
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
      const res = await gamesService.joinMatchmaking({ gameId: game.id, mode: "CUSTOM", targetPlayers: maxP });
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
      Alert.alert("Error", e?.response?.data?.message || "Could not create lobby.");
      onClose();
    } finally { setLobbyLoading(false); }
  }, [game, onClose]);

  // ── socket listeners (lobby + queue steps) ────────────────────────────────
  useEffect(() => {
    if (step !== "lobby" && step !== "queue") return;

    const onLobbyUpdated = (data: any) => {
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

    const onMatched = (data: any) => {
      const inc = data?.lobbyId || data?.ticket?.lobbyId;
      if (inc && inc !== lobbyIdRef.current && lobbyIdRef.current) return;
      _handleMatched(data);
    };

    const onTimedOut = (data: any) => {
      const inc = data?.lobbyId || data?.id;
      if (inc && inc !== lobbyIdRef.current && lobbyIdRef.current) return;
      if (matchedRef.current || cancelledRef.current) return;
      // CUSTOM lobbies expire after a long idle — close the queue gracefully.
      cancelledRef.current = true;
      if (fallbackTimerRef.current) clearInterval(fallbackTimerRef.current);
      setStatusText("Lobby expired. Please try again.");
      setTimeout(() => onClose(), 600);
    };

    socketClient.events.on("matchmaking:lobbyUpdated", onLobbyUpdated);
    socketClient.events.on("matchmaking:matched", onMatched);
    socketClient.events.on("matchmaking:timedOut", onTimedOut);
    return () => {
      socketClient.events.off("matchmaking:lobbyUpdated", onLobbyUpdated);
      socketClient.events.off("matchmaking:matched", onMatched);
      socketClient.events.off("matchmaking:timedOut", onTimedOut);
    };
  }, [step]);

  function _handleMatched(response: any) {
    if (matchedRef.current || cancelledRef.current) return;
    matchedRef.current = true;
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

  // ── navigation ────────────────────────────────────────────────────────────
  const pickMode = (m: MatchMode) => {
    setMode(m);
    setTargetPlayers("auto");
    // EVERY mode goes through the auto/custom slot-size chooser first — CUSTOM
    // uses it to pick the lobby size before the lobby is created.
    setStep("playerCount");
  };

  // Called from the auto/custom slot-size screen. AUTO/PRACTICE queue with the
  // chosen size; CUSTOM creates the lobby at the chosen size then shows it.
  const proceedFromCount = () => {
    if (mode === "CUSTOM") {
      const size = targetPlayers === "auto" ? maxP : (targetPlayers as number);
      setLobbyMaxPlayers(size);
      loadFollowers();
      createLobby(size).then(() => setStep("lobby"));
      return;
    }
    startAutoQueue(targetPlayers, mode === "PRACTICE" ? "PRACTICE" : "AUTO");
  };

  const goBack = () => {
    if (step === "playerCount") setStep("select");
    // CUSTOM lobby came from the slot-size step (or join-by-code from select)
    else if (step === "lobby") setStep(mode === "CUSTOM" ? "playerCount" : "select");
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
      Alert.alert("Invalid Code", e?.response?.data?.message || "Lobby not found or expired.");
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
    setQueuePhase("searching");
    setStatusText(isPractice ? "Preparing your practice lobby..." : "Searching for opponents...");
    setCountdown(null); setBotFilling(false); setStep("queue");
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
    })
      .then((res) => {
        if (cancelledRef.current) return;
        const d = res.data as any;
        if (d.status === "MATCHED" || d.ticket?.status === "MATCHED") { _handleMatched(d); return; }
        const id = d.lobbyId || d.ticket?.lobbyId;
        if (id) lobbyIdRef.current = id;
        // Pre-populate players/max so radar pins show immediately when joining
        // an existing lobby (players already spawned) vs a fresh one (I'm first).
        if (Array.isArray(d?.players)) setLobbyPlayers(d.players);
        if (d?.maxPlayers || d?.lobbyState?.maxPlayers) {
          setLobbyMaxPlayers(d.maxPlayers || d.lobbyState.maxPlayers);
        }
        // Joining an existing lobby? Its current players are "already spawned"
        // — render them instantly; only later joins (bots filling slots) animate.
        setSpawnBaseline(Math.max(1, Array.isArray(d?.players) ? d.players.length : 1));
        const expiresAt = d.expiresAt ? new Date(d.expiresAt).getTime() : Date.now() + 15_000;
        fallbackTimerRef.current = setInterval(() => {
          if (cancelledRef.current || matchedRef.current) { clearInterval(fallbackTimerRef.current!); return; }
          const rem = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
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
            setStatusText(
              isTournament
                ? "Still searching for tournament opponents..."
                : isPractice
                  ? "No players found — filling with bots for practice..."
                  : "No opponent found — filling with a bot..."
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
          Alert.alert("Error", e?.response?.data?.message || "Could not join matchmaking.");
          onClose();
        }
      });
  };

  // ── instant rematch re-queue ──────────────────────────────────────────────
  // When opened with autoQueue (from the result overlay's Rematch button),
  // skip the mode-select screen and jump straight into the AUTO queue for the
  // same game. Fires once per open; _reset() re-arms it for the next rematch.
  useEffect(() => {
    if (!visible || !autoQueue || !game) return;
    if (autoQueuedRef.current) return;
    autoQueuedRef.current = true;
    // Small delay so the modal's slide-in animation is visible before the queue
    const t = setTimeout(() => {
      const qm = initialMode === "PRACTICE" ? "PRACTICE" : "AUTO";
      setMode(qm);
      startAutoQueue("auto", qm);
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, autoQueue, game, initialMode]);


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
      Alert.alert("Error", e?.response?.data?.message || "Could not send invite.");
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
      Alert.alert("Error", e?.response?.data?.message || "Could not add bot.");
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
  // server's bot-fill grace keeps waiting for a friend who was never in the
  // lobby). The friend is NOT onboarded until they accept, so this is a pure
  // invite revocation, never a player removal.
  //
  // onLobbyUpdated only ever MERGES server pendingInvites into local state, so a
  // stale socket event racing this DELETE could re-add the invite. Re-fetching
  // the lobby afterwards reconciles pendingInviteIds to server truth, which no
  // longer contains the revoked invite.
  const removePendingInvite = async (playerId: string) => {
    const id = lobbyIdRef.current;
    setPendingInviteIds((prev) => prev.filter((i) => i !== playerId));
    if (!id) return;
    try {
      await apiClient.delete(`/game/lobbies/${id}/players/${playerId}`);
      const res = await apiClient.get(`/game/lobbies/${id}`);
      const d = (res as any).data?.data ?? (res as any).data;
      const serverPending: Array<{ userId: string }> = d?.settings?.pendingInvites || [];
      const joinedIds = new Set((d?.players || []).map((p: any) => pid(p)));
      setPendingInviteIds(serverPending.map((p) => p.userId).filter((uid) => !joinedIds.has(uid)));
    } catch { /* reconciled via socket */ }
  };

  const changeLobbySize = async (next: number) => {
    const id = lobbyIdRef.current;
    setLobbyMaxPlayers(next);
    if (id) {
      try { await apiClient.patch(`/game/lobbies/${id}`, { targetPlayers: next }); }
      catch { /* optimistic — ignore */ }
    }
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
          Alert.alert("Error", e?.response?.data?.message || "Could not start match.");
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
    setQueuePhase("searching"); setStatusText("Queuing lobby — bots will join to fill open slots...");
    setCountdown(15); setBotFilling(false); setStep("queue");
    try {
      const res = await apiClient.post(`/game/lobbies/${id}/queue`, { active: true });
      const d = (res as any).data?.data ?? (res as any).data;
      if (Array.isArray(d?.players)) setLobbyPlayers(d.players);
      if (d?.settings?.targetPlayers) setLobbyMaxPlayers(d.settings.targetPlayers);
      // NOTE: /queue returns the getLobby DTO, which always has a non-empty
      // players array (host is always in it) — so never treat the presence of
      // players as "matched". Only a genuinely resolved lobby (status READY from
      // fillMatchmakingLobby, or matchMetadata) counts. Otherwise we'd skip the
      // matchmaking screen and jump straight to "Match found!".
      if (d?.status === "MATCHED" || d?.state?.status === "READY" || d?.matchMetadata) {
        _handleMatched(d);
        return;
      }
      // Cosmetic countdown for the 15s real-player window; the sweep's
      // matchmaking:lobbyUpdated / matchmaking:matched events drive the rest.
      const queueExpiry = Date.now() + 15_000;
      fallbackTimerRef.current = setInterval(() => {
        if (cancelledRef.current || matchedRef.current) { clearInterval(fallbackTimerRef.current!); return; }
        const rem = Math.max(0, Math.ceil((queueExpiry - Date.now()) / 1000));
        setCountdown(rem);
        if (rem <= 0) {
          clearInterval(fallbackTimerRef.current!);
          setBotFilling(true); setQueuePhase("filling");
          // The server holds off up to 30s while fresh invites are out, so say so
          // instead of claiming bots are filling while nothing happens yet.
          setStatusText(
            pendingInviteIds.length > 0
              ? "Waiting for invited friends to accept — bots will fill the rest shortly"
              : "Filling remaining slots with bots..."
          );
        }
      }, 1000);
    } catch (e: any) {
      if (!cancelledRef.current) {
        Alert.alert("Error", e?.response?.data?.message || "Could not queue the lobby.");
        setStep("lobby"); setQueuePhase("searching");
      }
    }
  };

  // Close (X) from the queue screen: unqueue a custom lobby so bots stop
  // joining (or cancel the AUTO/tournament ticket), then close the modal.
  // Otherwise the lobby would keep filling and start a match without the host.
  const handleHeaderClose = async () => {
    if (step !== "queue") { onClose(); return; }
    if (mode === "CUSTOM" && lobbyIdRef.current) {
      apiClient.post(`/game/lobbies/${lobbyIdRef.current}/queue`, { active: false }).catch(() => {});
    } else {
      try { await gamesService.cancelMatchmakingTicket(); } catch { /* ok */ }
    }
    onClose();
  };

  const cancelQueue = async () => {
    cancelledRef.current = true; setCancelling(true);
    if (fallbackTimerRef.current) clearInterval(fallbackTimerRef.current);
    const id = lobbyIdRef.current;
    try {
      if (mode === "CUSTOM" && id) {
        // Return to the manual lobby screen — unqueue only, do NOT cancel the
        // host's ticket (that would kick them out of their own lobby).
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
    pendingInviteIds.forEach((personId) => {
      if (seen.has(personId)) return;
      const person = followers.find((f) => pid(f) === personId);
      if (!person) return;
      confirmed.push({
        id: personId,
        name: person.name || person.username,
        username: person.username,
        avatar: person.avatar || person.profileImage,
        _status: "invited",
      });
      seen.add(personId);
    });
    return confirmed;
  }, [lobbyPlayers, pendingInviteIds, followers, user]);

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
    : step === "playerCount" ? (mode === "CUSTOM" ? "Lobby Size" : "Player Count")
    : step === "lobby"       ? "Custom Lobby"
    : "Matchmaking";

  const canGoBack = step === "playerCount" || step === "lobby";


  // ── render ────────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
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

            {/* Auto Match */}
            <TouchableOpacity style={styles.modeCard} activeOpacity={0.85} onPress={() => pickMode("AUTO")}>
              <LinearGradient colors={[colors.primary, colors.cyanDark]} style={styles.modeIconCircle}>
                <Ionicons name="flash" size={22} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.modeTitle}>Auto Match</Text>
                <Text style={styles.modeDesc}>Jump into a queue. Choose auto or exact player count then go.</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
            </TouchableOpacity>

            {/* Practice Mode */}
            <TouchableOpacity style={styles.modeCard} activeOpacity={0.85} onPress={() => pickMode("PRACTICE")}>
              <LinearGradient colors={["#0EA5E9", "#22C55E"]} style={styles.modeIconCircle}>
                <Ionicons name="fitness" size={22} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.modeTitle}>Practice Mode</Text>
                <Text style={styles.modeDesc}>Solo practice — bots fill the match. Entry fee applies, no XP rewards.</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
            </TouchableOpacity>

            {/* Custom Lobby */}
            <TouchableOpacity style={styles.modeCard} activeOpacity={0.85} onPress={() => pickMode("CUSTOM")}>
              <LinearGradient colors={["#7C3AED", "#4F46E5"]} style={styles.modeIconCircle}>
                <Ionicons name="people" size={22} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.modeTitle}>Custom Lobby</Text>
                <Text style={styles.modeDesc}>Set a lobby size, invite friends or bots, and start when ready.</Text>
              </View>
              {lobbyLoading
                ? <ActivityIndicator size="small" color={colors.primaryLight} />
                : <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />}
            </TouchableOpacity>

            {/* Join by code */}
            <View style={styles.joinCodeCard}>
              <View style={styles.joinCodeHeader}>
                <Ionicons name="key-outline" size={18} color={colors.primaryLight} />
                <Text style={styles.joinCodeTitle}>Join with Code</Text>
              </View>
              <Text style={styles.joinCodeHint}>Enter an invite code to join a friend's private lobby.</Text>
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
                    ? <ActivityIndicator size="small" color="#fff" />
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
            isCustom={mode === "CUSTOM"}
            onProceed={proceedFromCount}
          />
        )}

        {/* ── custom: lobby ── */}
        {step === "lobby" && (
          <LobbyStep
            colors={colors} styles={styles} game={game}
            lobbyCode={lobbyCode} lobbyMaxPlayers={lobbyMaxPlayers}
            displayPlayers={displayPlayers} filledCount={filledCount}
            allFilled={allFilled} maxP={maxP}
            followers={filteredFollowers} followersLoading={followersLoading}
            searchQuery={searchQuery} copyState={copyState}
            pendingInviteIds={pendingInviteIds}
            invitedAtMap={invitedAtMap}
            onSearchChange={setSearchQuery}
            onInviteFriend={inviteFriend}
            onRemovePendingInvite={removePendingInvite}
            onRemovePlayer={removePlayer}
            onInviteBot={inviteBot}
            onChangeLobbySize={changeLobbySize}
            onCopyCode={copyCode}
            onProceed={proceedFromLobby}
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
            maxPlayers={lobbyMaxPlayers}
            initialCount={spawnBaseline}
          />
        )}
      </View>
    </Modal>
  );
}


// ─── PlayerCountStep ──────────────────────────────────────────────────────────

// ─── PlayerCountStep (AUTO only) ─────────────────────────────────────────────

function PlayerCountStep({ colors, styles, maxP, value, onChange, isPractice, isCustom, onProceed }: {
  colors: ColorPalette; styles: ReturnType<typeof makeStyles>;
  maxP: number;
  value: AutoSize;
  onChange: (v: AutoSize) => void;
  isPractice?: boolean;
  isCustom?: boolean;
  onProceed: () => void;
}) {
  const isAuto = value === "auto";
  const count  = isAuto ? maxP : (value as number);
  const ctaLabel = isCustom
    ? (isAuto ? "Create Lobby" : `Create ${count}-Player Lobby`)
    : isPractice
    ? (isAuto ? "Start Practice" : `Practice with ${count} Players`)
    : (isAuto ? "Find Any Match" : `Find ${count}-Player Match`);

  return (
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionLabel}>{isCustom ? "How many slots?" : "How many players?"}</Text>
      <Text style={styles.sectionHint}>
        {isCustom
          ? "Auto uses the game's max lobby size. Or pick an exact slot count for your custom lobby."
          : isPractice
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

      {/* Auto description */}
      {isAuto && (
        <View style={styles.autoDescCard}>
          <Ionicons
            name={isPractice ? "fitness" : isCustom ? "people-outline" : "sparkles-outline"}
            size={18}
            color={colors.primaryLight}
          />
          <Text style={styles.autoDescText}>
            {isCustom
              ? "Your lobby opens at the game's max size. Invite friends or add bots — then start when ready."
              : isPractice
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
  filledCount, allFilled, maxP, followers, followersLoading, searchQuery,
  copyState, pendingInviteIds, invitedAtMap, onSearchChange, onInviteFriend,
  onRemovePendingInvite, onRemovePlayer, onInviteBot, onChangeLobbySize,
  onCopyCode, onProceed,
}: {
  colors: ColorPalette; styles: ReturnType<typeof makeStyles>; game: Game;
  lobbyCode: string; lobbyMaxPlayers: number; displayPlayers: any[];
  filledCount: number; allFilled: boolean; maxP: number;
  followers: any[]; followersLoading: boolean; searchQuery: string;
  copyState: string; pendingInviteIds: string[];
  invitedAtMap: Record<string, number>;
  onSearchChange: (s: string) => void;
  onInviteFriend: (p: any) => void;
  onRemovePendingInvite: (id: string) => void;
  onRemovePlayer: (id: string) => void;
  onInviteBot: () => void;
  onChangeLobbySize: (n: number) => void;
  onCopyCode: () => void;
  onProceed: () => void;
}) {
  const totalSlots = lobbyMaxPlayers;

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

      {/* ── Player count stepper ── */}
      <View style={styles.panel}>
        <View style={styles.rowBetween}>
          <Text style={styles.panelTitle}>Slots</Text>
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
        <Text style={styles.slotCountText}>{filledCount} / {lobbyMaxPlayers} filled</Text>
      </View>

      {/* ── Circular slot ring ── */}
      <SlotRing
        colors={colors}
        styles={styles}
        players={displayPlayers}
        totalSlots={totalSlots}
        onRemovePlayer={onRemovePlayer}
      />

      {/* ── Pending invites (never occupy a slot — first come, first serve) ── */}
      {displayPlayers.some((p: any) => p._status === "invited") && (
        <View style={styles.pendingPanel}>
          <Text style={styles.panelTitle}>Pending Invites</Text>
          <Text style={styles.pendingHint}>
            Invited friends don't reserve a seat — first come, first served.
          </Text>
          {displayPlayers
            .filter((p: any) => p._status === "invited")
            .map((p: any) => (
              <View key={pid(p)} style={styles.pendingRow}>
                {p.avatar
                  ? <Image source={{ uri: p.avatar }} style={styles.friendAvatar} />
                  : <View style={styles.friendAvatarPh}>
                      <Text style={styles.friendInitial}>{(p.name || "?")[0].toUpperCase()}</Text>
                    </View>}
                <View style={{ flex: 1 }}>
                  <Text style={styles.friendName} numberOfLines={1}>{p.name}</Text>
                  {p.username ? <Text style={styles.friendHandle}>@{p.username}</Text> : null}
                </View>
                <View style={styles.invitedPill}>
                  <Ionicons name="time-outline" size={12} color={colors.primaryLight} />
                  <Text style={[styles.invitedPillText, { color: colors.primaryLight }]}>Invited</Text>
                </View>
                <TouchableOpacity
                  onPress={() => onRemovePendingInvite(pid(p))}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={18} color={colors.text.muted} />
                </TouchableOpacity>
              </View>
            ))}
        </View>
      )}

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
          <ActivityIndicator size="small" color={colors.primaryLight} style={{ marginTop: 12 }} />
        )}
        {!followersLoading && followers.length === 0 && (
          <Text style={styles.emptyText}>No mutual followers found.</Text>
        )}
        {followers.map((person: any) => {
          const personId = pid(person);
          const isPending   = pendingInviteIds.includes(personId);
          // Only a player who actually JOINED (ticket exists) counts as "In Lobby".
          // Pending invites are merely awaiting acceptance — never onboarded yet.
          const isInLobby   = displayPlayers.some((p: any) => pid(p) === personId && p._status !== "invited");
          const lastInvite  = invitedAtMap[personId] || 0;
          const cooldownMs  = 5000;
          const [now, setNow] = React.useState(Date.now());
          // Tick every second while in cooldown
          React.useEffect(() => {
            if (!isPending || !lastInvite) return;
            const t = setInterval(() => setNow(Date.now()), 1000);
            return () => clearInterval(t);
          }, [isPending, lastInvite]);
          const cooldownLeft = Math.max(0, Math.ceil((lastInvite + cooldownMs - now) / 1000));
          const canReinvite  = isPending && !isInLobby && cooldownLeft === 0;

          return (
            <View key={personId} style={styles.friendRow}>
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
                // Sent — show cooldown if still in window, else "Waiting"
                <View style={[styles.inviteBtn, styles.inviteBtnDim]}>
                  <Text style={[styles.inviteBtnText, { color: colors.text.muted }]}>
                    {cooldownLeft > 0 ? "Invited" : "Waiting..."}
                  </Text>
                </View>
              ) : (
                // Not yet invited OR cooldown expired — show Invite / Re-invite
                <TouchableOpacity
                  style={[styles.inviteBtn, allFilled && styles.inviteBtnDim]}
                  onPress={() => !allFilled && onInviteFriend(person)}
                  disabled={allFilled}
                >
                  <Text style={styles.inviteBtnText}>
                    {canReinvite ? "Resend" : "Invite"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
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

function QueueStep({ colors, styles, mode, game, phase, statusText, countdown, botFilling, cancelling, onCancel, players, maxPlayers, initialCount = 1 }: {
  colors: ColorPalette; styles: ReturnType<typeof makeStyles>;
  mode: MatchMode; game: Game;
  phase: "searching" | "filling" | "matched";
  statusText: string; countdown: number | null;
  botFilling: boolean; cancelling: boolean;
  onCancel: () => void;
  players?: any[]; maxPlayers?: number; initialCount?: number;
}) {
  return (
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      <MatchmakingRadar colors={colors} isActive={phase !== "matched"} players={players || []} initialCount={initialCount} />
      {mode === "CUSTOM" && players && players.length > 0 && (
        <SlotRing colors={colors} styles={styles} players={players} totalSlots={maxPlayers || players.length} />
      )}
      <View style={styles.queueCard}>
        <View style={styles.rowBetween}>
          <View style={styles.modePill}>
            <Text style={styles.modePillText}>
              {mode === "AUTO" ? "AUTO MATCH" : mode === "PRACTICE" ? "PRACTICE" : "CUSTOM LOBBY"}
            </Text>
          </View>
          {countdown !== null && phase === "searching" && !botFilling && (
            <View style={styles.timerPill}>
              <Ionicons name="time-outline" size={13} color={colors.primaryLight} />
              <Text style={styles.timerText}>{countdown}s</Text>
            </View>
          )}
        </View>
        <Text style={styles.queueTitle}>
          {phase === "matched" ? "Match Found!" : phase === "filling" ? "Setting up match..." : "Finding your match"}
        </Text>
        <Text style={styles.queueGame}>{game.name}</Text>
        <Text style={styles.queueStatus}>{statusText}</Text>
      </View>
      {botFilling && (
        <View style={styles.noticeRow}>
          <Ionicons name="sparkles" size={15} color={colors.primaryLight} />
          <Text style={styles.noticeText}>Bots are joining to fill the remaining slots.</Text>
        </View>
      )}
      {phase !== "matched" && (
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={cancelling}>
          <Text style={styles.cancelText}>{cancelling ? "Cancelling..." : "Cancel"}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

// ─── Radar animation ──────────────────────────────────────────────────────────

/**
 * Radar with player/bot pins. Pins spawn one at a time (staggered spring) so
 * bots joining to fill slots look like real players trickling in. When joining
 * an existing lobby the already-present players are pinned immediately; in a
 * brand-new lobby the current user is the first (only) pin.
 */
function MatchmakingRadar({ colors, isActive, players = [], initialCount = 1 }: {
  colors: ColorPalette; isActive: boolean; players?: any[]; initialCount?: number;
}) {
  const pulse = useRef(new Animated.Value(0.85)).current;
  const spin  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isActive) return;
    const p = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.12, duration: 1300, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.85, duration: 1300, useNativeDriver: true }),
    ]));
    const s = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 4200, useNativeDriver: true }));
    p.start(); s.start();
    return () => { p.stop(); s.stop(); };
  }, [isActive, pulse, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  // Pins orbit the radar center on a ring just inside the outer circle.
  // Invited friends are excluded — only actually-joined players/bots pin.
  const PIN_R = 60;
  const pins = players.filter((p) => p._status !== "invited");
  const visibleCount = Math.min(pins.length, 8);
  const positions = useMemo(() => {
    if (visibleCount === 0) return [];
    return circlePositions(visibleCount, PIN_R);
  }, [visibleCount]);
  const CENTER = 105; // radar canvas is 210x210, center at 105,105
  // Players already in the lobby when the queue screen appeared are "already
  // spawned" — render instantly. Only newly arriving players/bots (beyond
  // initialCount) animate in one by one, like real players trickling in.
  const pinDelay = (i: number) => (i < initialCount ? 0 : Math.min((i - initialCount + 1) * 260, 1500));

  return (
    <View style={{ width: 210, height: 210, alignItems: "center", justifyContent: "center", marginBottom: 16, alignSelf: "center" }}>
      {/* Rotating radar rings + center */}
      <Animated.View style={{ width: 170, height: 170, alignItems: "center", justifyContent: "center", transform: [{ rotate }] }}>
        {([170, 130, 90] as number[]).map((size) => (
          <Animated.View key={size} style={{
            position: "absolute", width: size, height: size, borderRadius: size / 2,
            borderWidth: 1, borderColor: colors.primaryLight,
            opacity: 0.5, transform: [{ scale: pulse }],
          }} />
        ))}
        <View style={{
          width: 56, height: 56, borderRadius: 28,
          backgroundColor: colors.bg.elevated, borderWidth: 1.5,
          borderColor: colors.primaryLight, alignItems: "center", justifyContent: "center",
        }}>
          <Ionicons name="scan" size={24} color={colors.primaryLight} />
        </View>
      </Animated.View>
      {/* Player/bot pins — pre-existing players render instantly, new joins spring in */}
      {pins.slice(0, 8).map((p, i) => (
        <RadarPin
          key={pid(p) || `pin-${i}`}
          colors={colors}
          player={p}
          x={CENTER + (positions[i]?.x || 0)}
          y={CENTER + (positions[i]?.y || 0)}
          delay={pinDelay(i)}
        />
      ))}
    </View>
  );
}

/**
 * A single pin on the radar — avatar (or 🤖 for bots) with a name tag,
 * springing in with a stagger so players appear to join one by one.
 */
function RadarPin({ colors, player, x, y, delay = 0 }: {
  colors: ColorPalette; player: any; x: number; y: number; delay?: number;
}) {
  const scale = useRef(new Animated.Value(0)).current;
  const fade  = useRef(new Animated.Value(0)).current;
  // Delay is fixed at mount (pins are keyed by player id, so a pin mounts once).
  // Capturing it in a ref keeps the spawn animation from re-firing if a player
  // leaves and shifts the array indices of the remaining pins.
  const delayRef = useRef(delay);

  useEffect(() => {
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start();
    }, delayRef.current);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isBot  = !!player.isBot || player._status === "bot";
  const isHost = player._status === "host";
  const name   = isHost ? "You" : (player.name || player.displayName || player.username || (isBot ? "Bot" : "?"));
  const avatar = player.avatar || player.avatarUrl;

  return (
    <Animated.View style={{
      position: "absolute", left: x - 14, top: y - 14, width: 28, height: 28,
      alignItems: "center", justifyContent: "center",
      opacity: fade, transform: [{ scale }],
    }}>
      {avatar
        ? <Image source={{ uri: avatar }} style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: isBot ? "#64748B" : colors.primaryLight }} />
        : <LinearGradient
            colors={isBot ? ["#334155", "#1E293B"] : [colors.primary, colors.cyanDark]}
            style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.primaryLight, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>
              {isBot ? "🤖" : (name || "?")[0].toUpperCase()}
            </Text>
          </LinearGradient>}
      {/* Name tag */}
      <View style={{
        position: "absolute", bottom: -16, backgroundColor: colors.bg.elevated,
        borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1,
        borderWidth: 1, borderColor: colors.border, maxWidth: 64,
      }}>
        <Text style={{ color: colors.text.primary, fontSize: 8, fontWeight: "700" }} numberOfLines={1}>{name}</Text>
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
    rowBetween:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    stepper:     { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    stepBtn:     { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", backgroundColor: c.bg.elevated },
    stepBtnDisabled: { opacity: 0.4 },
    stepVal:     { minWidth: 28, textAlign: "center", fontSize: fontSizes.md, fontWeight: "700", color: c.text.primary },
    slotCountText: { color: c.text.muted, fontSize: fontSizes.xs, marginTop: 4 },

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
    pendingPanel: { backgroundColor: c.bg.card, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border, padding: spacing.md, marginBottom: spacing.md },
    pendingHint:  { fontSize: fontSizes.xs, color: c.text.muted, marginBottom: 6, lineHeight: 16 },
    pendingRow:   { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
    invitedPill:  { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: c.bg.elevated, borderRadius: radii.full, borderWidth: 1, borderColor: "rgba(124,58,237,0.3)" },
    invitedPillText: { fontSize: fontSizes.xs, fontWeight: "700" },

    // queue
    queueCard:   { backgroundColor: c.bg.card, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg, marginBottom: spacing.md },
    modePill:    { paddingHorizontal: spacing.md, paddingVertical: 5, backgroundColor: c.bg.elevated, borderRadius: radii.full },
    modePillText:{ color: c.primaryLight, fontSize: fontSizes.xs, fontWeight: "700", letterSpacing: 1 },
    timerPill:   { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: c.bg.elevated, paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radii.full },
    timerText:   { color: c.text.primary, fontWeight: "700", fontSize: fontSizes.sm },
    queueTitle:  { fontSize: fontSizes.lg, fontWeight: "700", color: c.text.primary, marginTop: spacing.sm },
    queueGame:   { fontSize: fontSizes.sm, color: c.text.secondary, marginTop: 4 },
    queueStatus: { fontSize: fontSizes.sm, color: c.text.secondary, marginTop: spacing.sm, lineHeight: 20 },
    noticeRow:   { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.bg.elevated, padding: spacing.md, borderRadius: radii.md, marginBottom: spacing.md },
    noticeText:  { color: c.text.primary, fontWeight: "600", fontSize: fontSizes.sm },
    cancelBtn:   { marginTop: spacing.sm, height: 52, borderRadius: radii.full, backgroundColor: c.bg.card, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
    cancelText:  { color: c.text.secondary, fontWeight: "700", fontSize: fontSizes.md },
  });
}
