import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  DeviceEventEmitter,
  Easing,
  Image,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  ImageBackground,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type {
  HomeStackParamList,
  NotificationNewPayload,
  SessionExpiredPayload,
} from "../../types";
import { fontSizes, radii, spacing, type ColorPalette } from "../../theme";
import { useThemeColors } from "../../context/ThemeContext";
import PullToRefreshWrapper from "../../components/common/PullToRefreshWrapper";
import {
  useGames,
  type GameMatch,
  type PlayMode,
} from "../../context/GamesContext";
import {
  gamesService,
  type GameTournament,
  type MatchmakingResponse,
} from "../../services/games.service";
import MainHeader from "../../components/common/MainHeader";
import { SectionHeader } from "../../components/common/SectionChrome";
import ActiveStatusDot from "../../components/common/ActiveStatusDot";
import StateBlock from "../../components/common/StateBlock";
import AppGameHost from "../../components/games/infrastructure/AppGameHost";
import { preloadRuntime } from "../../games/GameRuntimeRegistry";
import GameLogo from "../../components/games/utilities/GameLogo";
import GameChatPanel from "../../components/games/utilities/GameChatPanel";
import GameStartScreen from "../../components/games/utilities/GameStartScreen";
import GameCard from "../../components/games/utilities/GameCard";
import TournamentCard from "../../components/games/utilities/TournamentCard";
import HistoryModal from "../../components/games/utilities/HistoryModal";
import MatchRow from "../../components/games/utilities/MatchRow";
import GameSettingsModal from "../../components/games/utilities/GameSettingsModal";
import { makeStyles } from "./GamesScreen.styles";

import LottieView from "lottie-react-native";
import { getCachedLottieSync, getCachedLottie, S3_APP_ICON_LOTTIE_URL } from "../../services/lottie.service";

import type { Game } from "../../types";
import type { HtmlGameResult, PlayerContext } from "../../games/types";
import { preloadGameAssets as preloadManifestAssets, releaseAssetSet, preloadGameThumbnails, getCachedThumbnail, warmThumbnailCache, pruneOldAssetVersions } from "../../games/assetManifest";
const MatchModeModal = React.lazy(() => import("../../components/games/utilities/MatchModeModal"));
const GameResultOverlay = React.lazy(() => import("../../components/games/utilities/GameResultOverlay"));
const RoundResultOverlay = React.lazy(() => import("../../components/games/utilities/RoundResultOverlay"));
import { accountSocket } from "../../services/accountSocketClient";
import type { User } from "../../types";
import { useAuth } from "../../context/AuthContext";
import TournamentLeaderboardModal from "../../components/games/utilities/TournamentLeaderboardModal";
import {
  gameSound,
  destroyGameSound,
  useGameSoundPrefs,
} from "../../services/gameSound";
import { themedAlert } from "../../components/common/ThemedAlert";
import GamesMatchmakingModal from "../../components/games/utilities/GamesMatchmakingModal";
import { useRoundLifecycle } from "../../hooks/useRoundLifecycle";
import { warn } from '../../utils/logger';

type ActiveTab = "games" | "tournaments" | "history";
type ScreenModal = "none" | "history";


type ActiveSession = {
  game: Game;
  mode: PlayMode;
  matchId: string;
  sessionId: string;
  wsToken?: string;
  players?: PlayerContext[];
  tournamentId?: string;
  /** True when the lobby locked teams (team PvP), from match metadata. */
  teamsLocked?: boolean;
  /** The current user's assigned team, from match metadata snapshots. */
  myTeam?: number;
  /** Set when the session was re-opened from a reconnect — skip the countdown. */
  isRejoin?: boolean;
  /** Number of rounds configured for this match (default 1). */
  configuredRounds?: number;
};

const formatTimeLeft = (endsAt: string) => {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const hours = Math.floor(diff / 36e5);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  return `${hours}h`;
};

const formatStartsIn = (startsAt: string) => {
  const diff = new Date(startsAt).getTime() - Date.now();
  if (diff <= 0) return "Started";
  const hours = Math.floor(diff / 36e5);
  const days = Math.floor(hours / 24);
  if (days > 0) return `starts in ${days}d ${hours % 24}h`;
  if (hours > 0) return `starts in ${hours}h`;
  const minutes = Math.max(1, Math.floor(diff / 6e4));
  return `starts in ${minutes}m`;
};

// Game rendering is runtime-driven via AppGameHost.
// No hardcoded GAME_COMPONENTS map — AppGameHost routes by runtimeType + runtime
// from backend metadata. Adding a new game = backend-only change (new plugin + registry entry).

export default function GamesScreen() {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const colors = useThemeColors();
  const { user } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {
    matches,
    games: backendGames,
    trendingSlugs: backendTrending,
    fetchGamesData,
    refreshMatchHistory,
    refreshGames,
  } = useGames();

  // Merges backend games, then orders the display list so trending games
  // (top 3) appear FIRST, followed by the rest. All visual fields are
  // SSOT from the backend — no hardcoded asset lookups.
  const realGames: Game[] = useMemo(() => {
    if (!backendGames || backendGames.length === 0) return [];
    const merged = backendGames.map((bg) => {
      return {
        ...bg,
        // All visual fields are SSOT from the backend game object.
        // No hardcoded fallbacks — the backend returns emoji, gradient,
        // thumbnail, entryFee, prize, and averageDurationLabel.
        imageUrl: getCachedThumbnail(bg.slug || '') || bg.thumbnail || bg.imageUrl,
        entryFee: bg.metadata?.entryFee || bg.entryFee,
        prize: bg.metadata?.prize || bg.prize,
        averageDurationLabel:
          bg.metadata?.averageDurationLabel || (bg as any).averageDurationLabel,
      };
    });

    const trendingSet = new Set<string>(backendTrending || []);
    const trending: Game[] = [];
    const rest: Game[] = [];
    for (const g of merged) {
      if (trendingSet.has(g.id) || trendingSet.has(g.slug || "")) {
        trending.push(g);
      } else {
        rest.push(g);
      }
    }
    return [...trending, ...rest];
  }, [backendGames, backendTrending]);

  const findLocalGame = useCallback(
    (gameId: string) =>
      realGames.find((game) => game.id === gameId || game.slug === gameId),
    [realGames],
  );

  const realGamesRef = useRef(realGames);
  useEffect(() => {
    realGamesRef.current = realGames;
  }, [realGames]);

  const [activeTab, setActiveTab] = useState<ActiveTab>("games");
  const [screenModal, setScreenModal] = useState<ScreenModal>("none");
  const [tournaments, setTournaments] = useState<GameTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [incomingInvite, setIncomingInvite] = useState<any>(null);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(
    null,
  );

  const [leaderboardModalVisible, setLeaderboardModalVisible] = useState(false);
  const [selectedTournament, setSelectedTournament] =
    useState<GameTournament | null>(null);
  const [selectedTournamentId, setSelectedTournamentId] = useState<
    string | null
  >(null);
  const [reconnectSession, setReconnectSession] = useState<any>(null);
  const [matchModalVisible, setMatchModalVisible] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [incomingInviteCode, setIncomingInviteCode] = useState<string | null>(
    null,
  );
  // Rematch shortcut: when true, MatchModeModal skips mode-select and jumps
  // straight into the AUTO queue for the selected game.
  const [rematchAutoQueue, setRematchAutoQueue] = useState(false);
  // Which queue the rematch should land in (practice matches re-queue practice).
  const [rematchInitialMode, setRematchInitialMode] = useState<
    "AUTO" | "PRACTICE"
  >("AUTO");
  // Game-specific settings (sound + haptics) — a dedicated modal like Wallet's,
  // NOT the global Settings screen.
  const [gameSettingsVisible, setGameSettingsVisible] = useState(false);
  const [globalMatchModalVisible, setGlobalMatchModalVisible] = useState(false);



  // No-op: asset preload now happens in handleMatched after matchmaking,
  // using the backend-decided runtime + asset contract.

  const handleGamePlay = useCallback(
    async (game: Game, isRejoin: boolean) => {
      if (isRejoin) {
        setActiveSession({
          ...(reconnectSession as any),
          isRejoin: true,
        });
        setReconnectSession(null);
        return;
      }
      if (!user || user.xp < (game.entryFee || 0)) {
        themedAlert(
          "Insufficient XP",
          `You need ${game.entryFee || 0} XP to play ${game.name}.`
        );
        return;
      }
      // No pre-download needed — logos, sounds, and all game assets are
      // delivered via the backend asset manifest after matchmaking.
      // The manifest preload + runtime preload happen in handleMatched
      // during the countdown.
      setSelectedGame(game);
      setMatchModalVisible(true);
    },
    [reconnectSession, user],
  );

  const loadGamesData = useCallback(async () => {
    setLoading(true);
    try {
      await fetchGamesData();
      // Pre-download game thumbnails from backend-provided URLs so the
      // grid shows local artwork instantly (no remote fetch on render).
      // Fire-and-forget — runs in background, never blocks the tab.
      const games = realGamesRef.current;
      if (games.length > 0) {
        preloadGameThumbnails(games).catch(() => {});
      }
    } catch (e) {
      warn("Failed to fetch games history", e);
    }
    try {
      const tournamentsRes = await gamesService.getTournaments(1, 20);
      setTournaments(tournamentsRes?.data || []);
    } catch (error) {
      warn("Failed to load tournaments", error);
      setTournaments([]);
    }
    try {
      const activeRes = await gamesService.getActiveSession();
      setReconnectSession(activeRes?.data || null);
    } catch (error) {
      setReconnectSession(null);
    } finally {
      setLoading(false);
    }
  }, [fetchGamesData]);

  // Tab-aware refresh — ONE API per active pill. Shared by pull-to-refresh,
  // the tab-bar double-tap, and subsequent focus events.
  const refreshForActiveTab = useCallback(async () => {
    if (activeTab === "tournaments") {
      try {
        const res = await gamesService.getTournaments(1, 20);
        setTournaments(res?.data || []);
      } catch (error) {
        warn("Failed to load tournaments", error);
        setTournaments([]);
      }
      return;
    }
    if (activeTab === "history") {
      await refreshMatchHistory();
      return;
    }
    // games pill — a single getGames call (trending + resume banner stay
    // stale on purpose, per request).
    await refreshGames();
  }, [activeTab, refreshMatchHistory, refreshGames]);

  // First mount loads EVERYTHING (full sweep warms all pills); later focus
  // events only refresh the active pill so tab switches don't rerun the
  // whole loadGamesData sweep. Subsequent focus refreshes are debounced — a
  // blur during the 300ms window cancels the pending refresh.
  const hasLoadedRef = useRef(false);
  // Scroll offset is saved on every scroll and restored on refocus so
  // re-entering the tab keeps your place (like Communities/Events).
  const gamesScrollRef = useRef<any>(null);
  const gamesScrollOffsetRef = useRef(0);
  useFocusEffect(
    useCallback(() => {
      // Warm the thumbnail cache from disk so previously downloaded
      // thumbnails appear instantly without waiting for preloadGameThumbnails.
      warmThumbnailCache().catch(() => {});
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true;
        loadGamesData();
      } else {
        const t = setTimeout(() => {
          refreshForActiveTab();
          setTimeout(() => {
            gamesScrollRef.current?.scrollTo({
              y: gamesScrollOffsetRef.current,
              animated: false,
            });
          }, 80);
        }, 300);
        return () => clearTimeout(t);
      }
    }, [loadGamesData, refreshForActiveTab]),
  );

  // Tab-bar single-tap → scroll to top; double-tap → scroll to top + refresh
  // the active pill (same as Home's double-tap behavior).
  useEffect(() => {
    const subs = [
      DeviceEventEmitter.addListener("gamesSingleTap", () => {
        gamesScrollRef.current?.scrollTo({ y: 0, animated: true });
      }),
      DeviceEventEmitter.addListener("gamesDoubleTap", () => {
        gamesScrollRef.current?.scrollTo({ y: 0, animated: true });
        DeviceEventEmitter.emit("triggerPullRefresh");
        setTimeout(() => {
          // Drive `refreshing` so the wrapper holds the bubble while the
          // fetch runs, then springs it back — otherwise it would stay
          // pulled down (the refresh runs without flipping refreshing).
          setRefreshing(true);
          refreshForActiveTab().finally(() => setRefreshing(false));
        }, 500);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [refreshForActiveTab]);

  useEffect(() => {
    const sub = require("react-native").DeviceEventEmitter.addListener(
      "GAME_INVITE_ACCEPTED",
      (payload: any) => {
        const inviteCode = payload?.inviteCode;
        const gameName = payload?.gameName;
        const game = realGamesRef.current.find(
          (g) => g.name?.toLowerCase() === String(gameName || "").toLowerCase(),
        );

        if (game && inviteCode) {
          setActiveTab("games");
          setSelectedGame(game);
          setIncomingInviteCode(inviteCode);
          setMatchModalVisible(true);
        }
      },
    );

    const handleNewNotif = (notif: NotificationNewPayload) => {
      if (notif.type === "GAME_INVITE" || notif.type === "game_invite") {
        setIncomingInvite(notif);
      }
    };

    const handleSessionExpired = (_data: SessionExpiredPayload) => {
      setReconnectSession(null);
    };

    const subGamesModal = require("react-native").DeviceEventEmitter.addListener("openGamesMatchmaking", () => {
      setGlobalMatchModalVisible(true);
    });

    accountSocket.events.on("notification:new", handleNewNotif);
    accountSocket.events.on("SESSION_EXPIRED", handleSessionExpired);

    return () => {
      sub.remove();
      subGamesModal.remove();
      accountSocket.events.off("notification:new", handleNewNotif);
      accountSocket.events.off("SESSION_EXPIRED", handleSessionExpired);
    };
  }, []);

  const joinTournament = async (tournament: GameTournament) => {
    const run = async () => {
      try {
        const res = await gamesService.joinTournament(tournament.id);
        setTournaments((prev) =>
          prev.map((item) => (item.id === tournament.id ? res.data : item)),
        );
      } catch (error: any) {
        themedAlert(
          "Tournament Error",
          error.response?.data?.message || "Could not join tournament.",
        );
      }
    };

    if (tournament.entryFeeXP > 0 && !tournament.isJoined) {
      themedAlert("Join Tournament", `Entry fee: ${tournament.entryFeeXP} XP`, [
        { text: "Cancel", style: "cancel" },
        { text: "Join", onPress: run },
      ]);
      return;
    }

    await run();
  };

  const handleMatched = useCallback(
    (request: any, response: MatchmakingResponse) => {
      // Modal already closed itself — just start the session
      setMatchModalVisible(false);
      setSelectedGame(null);
      // A rematch modal closes itself here (not via onClose), so the flags must
      // be cleared too — otherwise the next normal "Play" would auto-queue.
      setRematchAutoQueue(false);
      setRematchInitialMode("AUTO");

      const sessionMode =
        request.mode === "tournament"
          ? "tournament"
          : request.mode === "practice"
            ? "practice"
            : request.mode === "invite"
              ? "custom"
              : "auto";

      // Pull matchGroupId from every possible location the server returns it
      // In the new lobby flow: lobbyId IS the match group identifier
      const matchGroupId =
        response.matchMetadata?.matchGroupId ||
        response.matchMetadata?.lobbyId ||
        response.match?.metadata?.matchGroupId ||
        response.ticket?.matchGroupId ||
        (response as any).lobbyId ||
        null;

      gamesService
        .startGameSession(request.game.id, sessionMode, matchGroupId)
        .then((res) => {
          // Build opponent list from whatever the server returned
          const players: PlayerContext[] = [];
          // Capture the current user's own team + the lobby's teamsLocked flag
          // from the match snapshots, so the countdown can show team PvP cleanly.
          let myTeam: number | undefined;

          // From matchMetadata.playerSnapshots (new lobby flow)
          const snapshots: any[] =
            (response as any).matchMetadata?.playerSnapshots || [];
          snapshots.forEach((p: any) => {
            if (p.id === user?.id) {
              myTeam = p.team;
              return;
            }
            players.push({
              id: p.id,
              name: p.displayName || p.username || "Opponent",
              username: p.username,
              avatar: p.avatar,
              team: p.team,
              seat: p.seat,
              level: p.level,
            });
          });

          // Fallback: legacy opponent field
          if (players.length === 0 && response.opponent) {
            players.push({
              id:
                response.opponent.id || response.opponent.userId || "opponent",
              name:
                response.opponent.name ||
                response.opponent.username ||
                "Opponent",
              username: response.opponent.username,
              avatar: response.opponent.avatarUrl || response.opponent.avatar,
            });
          }

          if (players.length === 0 && response.ticket?.opponentName) {
            players.push({
              id: "opponent",
              name: response.ticket.opponentName,
            });
          }

          // Merge runtime + asset contract from startGameSession response
          // into the game object so AppGameHost and the asset system can use
          // the backend-decided manifest (per-match aware).
          const sessionRuntime = {
            runtime: res.data?.runtime || request.game.runtime,
            runtimeType: res.data?.runtimeType || request.game.runtimeType || 'app',
            runtimeVersion: res.data?.runtimeVersion || request.game.runtimeVersion || 1,
            protocolVersion: res.data?.protocolVersion || request.game.protocolVersion || 1,
            minAppVersion: res.data?.minAppVersion || request.game.minAppVersion,
            assetSetId: res.data?.assetSetId || request.game.assetSetId,
            assetManifestVersion: res.data?.assetManifestVersion || request.game.assetManifestVersion,
          };

          setActiveSession({
            game: { ...request.game, ...sessionRuntime } as any,
            mode:
              request.mode === "tournament"
                ? "tournament"
                : request.mode === "practice"
                  ? "practice"
                  : request.mode === "invite"
                    ? "custom"
                    : "auto",
            matchId:
              res.data?.ticket?.userMatchId ||
              res.data?.sessionId ||
              (response as any).matchMetadata?.playerSnapshots?.[0]?.id ||
              response.match?.id,
            sessionId: res.data?.sessionId || response.match?.id,
            wsToken: res.data?.wsToken || res.data?.ticket?.token,
            players: players.length > 0 ? players : undefined,
            tournamentId: request.tournamentId,
            teamsLocked: !!(response as any).matchMetadata?.teamsLocked,
            myTeam,
            configuredRounds: res.data?.configuredRounds || request.game.rounds?.default || 1,
          });

          // ── Kick off manifest + runtime preload DURING countdown ────────
          // The game mounts in prestart (behind the countdown overlay), so
          // these fire-and-forget downloads run while the countdown ticks.
          // By the time phase switches to "playing", the bundle and critical
          // assets are already cached.
          const rSlug = sessionRuntime.runtime || request.game.slug || '';
          const rVer = sessionRuntime.runtimeVersion || 1;
          preloadRuntime(rSlug, rVer);
          if (sessionRuntime.assetSetId && sessionRuntime.assetManifestVersion) {
            preloadManifestAssets(sessionRuntime.assetSetId, sessionRuntime.assetManifestVersion).catch(() => {});
          }
        })
        .catch((err: any) => {
          themedAlert(
            "Error",
            err?.response?.data?.message ||
              "Failed to initialize the game session.",
          );
        });
    },
    [user?.id],
  );

  const handleSessionClose = async () => {
    // Release native audio players — frees ~11 AudioPlayer allocations.
    // initGameSound() will recreate them on next PLAY tap.
    destroyGameSound().catch(() => {});
    // Release the asset set from the active set so it can be pruned,
    // then prune old versions of ALL asset sets to reclaim disk space.
    if (activeSession?.game?.assetSetId) {
      releaseAssetSet(activeSession.game.assetSetId);
    }
    try {
      // Prune is non-blocking — runs in background, never blocks UI.
      const currentId = activeSession?.game?.assetSetId || "";
      const currentVer = (activeSession?.game as any)?.assetManifestVersion || 1;
      pruneOldAssetVersions(currentId, currentVer).catch(() => {});
    } catch { /* best-effort */ }
    // Clear stale reconnect session IMMEDIATELY so the REJOIN button on the
    // game card disappears the moment the session closes. loadGamesData() will
    // re-fetch the active session from the server — if a new one exists it
    // will re-appear; if the old one was stale it stays cleared.
    setReconnectSession(null);
    setActiveSession(null);
    loadGamesData();
  };

  // Rematch: close the finished session, then re-open MatchModeModal which
  // auto-queues the same game instantly (autoQueue prop jumps to the queue).
  const handleRematch = useCallback(() => {
    const s = activeSession as ActiveSession | null;
    setActiveSession(null);
    setSelectedGame(s?.game || null);
    setSelectedTournamentId(s?.tournamentId || null);
    // Custom lobbies can't be re-queued instantly (they need a fresh lobby),
    // so only auto-queue AUTO / practice / tournament rematches.
    setRematchAutoQueue(s?.mode !== "custom");
    setRematchInitialMode(s?.mode === "practice" ? "PRACTICE" : "AUTO");
    setMatchModalVisible(true);
  }, [activeSession]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <MainHeader />


      <PullToRefreshWrapper
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          // Pull-to-refresh re-fetches ONLY the active pill's data (one API
          // per pill) instead of loadGamesData's full sweep on every pull.
          try {
            await refreshForActiveTab();
          } finally {
            setRefreshing(false);
          }
        }}
        sectionHeader={
          /* Pinned with the main header — title + tab chips slide away with
              it for a full-screen feed, and ease back in together. The invite
              banner below still scrolls with the content. Shared SectionHeader
              component. */
          <SectionHeader
            title="Games Zone"
            subtitle="Compete, climb rankings, and earn XP."
            actions={[
              {
                icon: "settings-outline",
                onPress: () => setGameSettingsVisible(true),
              },
              {
                icon: "trophy-outline",
                onPress: () =>
                  navigation.navigate("Leaderboards", { initialTab: "Games" }),
              },
            ]}
            pills={(["games", "tournaments", "history"] as ActiveTab[]).map((tab) => ({
              key: tab,
              label: tab === "games" ? "Games" : tab === "tournaments" ? "Tournaments" : "History",
              active: activeTab === tab,
              onPress: () => setActiveTab(tab),
            }))}
          />
        }
        sectionHeaderH={144}
      >
        <ScrollView
          ref={gamesScrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content]}
          onScroll={(e) => {
            gamesScrollOffsetRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
        >

            {incomingInvite && (
              <View style={styles.inviteBanner}>
                <View style={styles.inviteBannerRow}>
                  {/* Sender avatar + live active-status dot on the custom-match invite */}
                  <View style={{ position: "relative", width: 36, height: 36 }}>
                    <View style={styles.inviteAvatar}>
                      {incomingInvite.senderAvatarUrl ? (
                        <Image
                          source={{ uri: incomingInvite.senderAvatarUrl }}
                          style={{ width: 36, height: 36, borderRadius: 18 }}
                        />
                      ) : (
                        <Ionicons name="person" size={16} color="#fff" />
                      )}
                    </View>
                    <ActiveStatusDot
                      userId={incomingInvite.senderId}
                      size={11}
                      style={{ bottom: -1, right: -1 }}
                    />
                  </View>
                  <Text style={styles.inviteBannerText}>
                    {(incomingInvite.message || "You have a new game invite!")
                      .split("|")[0]
                      .trim()}
                  </Text>
                </View>
                <View style={styles.inviteBannerActions}>
                  <TouchableOpacity
                    style={styles.inviteJoinBtn}
                    onPress={() => {
                      // Message format: "<text> | <lobbyId> | <inviteCode>"
                      const parts = (incomingInvite.message || "")
                        .split("|")
                        .map((s: string) => s.trim());
                      const inviteCode = parts[2] || parts[1];
                      const gameId = incomingInvite.resourceId;
                      const game = realGamesRef.current.find(
                        (g) => g.id === gameId || g.slug === gameId,
                      );

                      if (inviteCode && game) {
                        setActiveTab("games");
                        setSelectedGame(game);
                        // Pre-fill the join code and open modal at select step
                        // The user will see the modal with join code pre-filled
                        setIncomingInviteCode(inviteCode);
                        setMatchModalVisible(true);
                        setIncomingInvite(null);
                      }
                    }}
                  >
                    <Text style={styles.inviteJoinBtnText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.inviteDenyBtn}
                    onPress={() => setIncomingInvite(null)}
                  >
                    <Text style={styles.inviteDenyBtnText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
        {activeTab === "games" && (
          <>
            <ContentSectionHeader title="Available Games" />
            {loading && realGames.length === 0 ? (
              <View style={{ minHeight: 300, justifyContent: 'center' }}><StateBlock card loading label="Loading games" /></View>
            ) : (
              <View style={styles.gameGridWrapper}>
                {realGames.map(game => {
                  const isRejoin = !!reconnectSession && reconnectSession.gameId === game.id;
                  const rejoinWindowMs = isRejoin ? reconnectSession.reconnectWindowMs : null;
                return (
                  <View key={game.id} style={styles.gameGridItem}>
                    <GameCard
                      game={{
                        ...game,
                        isHot:
                          backendTrending?.includes(game.id) ||
                          backendTrending?.includes(game.slug || "") ,
                      }}
                      isRejoin={isRejoin}
                      rejoinWindowMs={rejoinWindowMs}
                      onRejoinExpired={() => {
                        setReconnectSession(null);
                        loadGamesData();
                      }}
                      onPlayClick={() => handleGamePlay(game, isRejoin)}
                    />
                  </View>
                );
              })}
              </View>
            )}
          </>
        )}

        {activeTab === "tournaments" && (
          <>
            <ContentSectionHeader title="Active Tournaments" />
            {loading && tournaments.length === 0 ? (
              <StateBlock card loading label="Loading tournaments" />
            ) : tournaments.length === 0 ? (
              <StateBlock
                card
                title="No active tournaments"
                subtitle="Check back soon for the next challenge."
              />
            ) : (
              <View style={{ paddingHorizontal: 16, gap: 10 }}>
              {tournaments.map((tournament) => {
                const game = findLocalGame(tournament.gameId);
                if (!game) return null;
                return (
                  <TouchableOpacity
                    key={tournament.id}
                    activeOpacity={0.9}
                    onPress={() => {
                      setSelectedTournament(tournament);
                      setLeaderboardModalVisible(true);
                    }}
                  >
                    <TournamentCard
                      tournament={tournament}
                      game={game}
                      onJoin={() => joinTournament(tournament)}
                      onPlay={() => {
                        setSelectedGame(game);
                        setSelectedTournamentId(tournament.id);
                        setMatchModalVisible(true);
                      }}
                    />
                  </TouchableOpacity>
                );
              })}
              </View>
            )}
          </>
        )}

        {activeTab === "history" && (
          <>
            <ContentSectionHeader
              title="Recent Matches"
              action="Open"
              onPress={() => setScreenModal("history")}
            />
            {matches.length === 0 ? (
              <StateBlock
                card
                title="No matches yet"
                subtitle="Play a match to build your record."
              />
            ) : (
              matches.map((match) => <MatchRow key={match.id} match={match} />)
            )}
          </>
        )}
      </ScrollView>
      </PullToRefreshWrapper>

      <GamesMatchmakingModal
        visible={globalMatchModalVisible}
        onClose={() => setGlobalMatchModalVisible(false)}
        games={realGames}
        reconnectSession={reconnectSession}
        onPlayClick={handleGamePlay}
      />

      <React.Suspense fallback={null}>
      <MatchModeModal
        visible={matchModalVisible}
        game={selectedGame}
        initialInviteCode={incomingInviteCode}
        initialTournamentId={selectedTournamentId}
        autoQueue={rematchAutoQueue}
        initialMode={rematchInitialMode}
        onClose={() => {
          setMatchModalVisible(false);
          setIncomingInviteCode(null);
          setSelectedTournamentId(null);
          setRematchAutoQueue(false);
          setRematchInitialMode("AUTO");
        }}
        onMatched={handleMatched}
      />
      </React.Suspense>

      {activeSession && (
        <GamePlayModal
          session={activeSession}
          onClose={handleSessionClose}
          onRematch={handleRematch}
        />
      )}

      <HistoryModal
        visible={screenModal === "history"}
        matches={matches}
        onClose={() => setScreenModal("none")}
      />

      <TournamentLeaderboardModal
        visible={leaderboardModalVisible}
        tournament={selectedTournament}
        onClose={() => {
          setLeaderboardModalVisible(false);
          setSelectedTournament(null);
        }}
      />

      <GameSettingsModal
        visible={gameSettingsVisible}
        onClose={() => setGameSettingsVisible(false)}
      />
    </View>
  );
}

function ContentSectionHeader({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onPress && (
        <TouchableOpacity onPress={onPress}>
          <Text style={styles.sectionAction}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** Branded Lottie loader shown while React.lazy resolves a game bundle. */
function BrandedGameLoader() {
  const [lottieSource, setLottieSource] = useState<any>(getCachedLottieSync(S3_APP_ICON_LOTTIE_URL));
  useEffect(() => {
    if (lottieSource) return;
    getCachedLottie(S3_APP_ICON_LOTTIE_URL).then((animData) => {
      if (animData) setLottieSource(animData);
    }).catch(() => {});
  }, []);
  return (
    <View style={{ alignItems: 'center', gap: 16 }}>
      {lottieSource ? (
        <LottieView
          source={lottieSource}
          autoPlay
          loop
          style={{ width: 80, height: 80 }}
          colorFilters={[{ keypath: '*', color: '#7C3AED' }]}
        />
      ) : (
        <StateBlock inline loading loaderSize={44} />
      )}
      <Text style={{ color: '#7C3AED', fontSize: 14, fontWeight: '700' }}>
        Loading game...
      </Text>
    </View>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.infoPill}>
      <Text style={styles.infoValue}>{value}</Text>
      <Text style={styles.infoLabel}>{label}</Text>
    </View>
  );
}

/**
 * DisconnectOverlay — shown when a player disconnects during the match.
 * Animated countdown ring, player avatar, fun tips, and exit option.
 */
function DisconnectOverlay({
  players,
  onExit,
}: {
  players: Array<{ userId: string; name: string; remainingMs: number }>;
  onExit: () => void;
}) {
  const colors = useThemeColors();
  const count = players.length;
  // Use the SHORTEST remaining time across all disconnected players
  const minRemaining = Math.min(...players.map((p) => p.remainingMs));
  const minSeconds = Math.max(0, Math.floor(minRemaining / 1000));

  // Scale avatar size based on player count
  const avatarSize = count <= 2 ? 72 : count <= 4 ? 56 : 44;
  const avatarFontSize = count <= 2 ? 28 : count <= 4 ? 22 : 18;

  // Ring animation — duration = min remaining time
  const ringProgress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    ringProgress.setValue(0);
    if (minRemaining > 0) {
      Animated.timing(ringProgress, {
        toValue: 1,
        duration: minRemaining,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();
    }
  }, [minRemaining]);

  // Pulse on player avatars
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Tip rotation
  const tips = [
    "While you wait, plan your next move...",
    "Use this time to think about your strategy.",
    "Stay focused — the match resumes any moment.",
    "A calm player is a winning player.",
    "Take a deep breath while you wait.",
  ];
  const [tipIdx, setTipIdx] = useState(0);
  const tipFade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(tipFade, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setTipIdx((i) => (i + 1) % tips.length);
        Animated.timing(tipFade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
  };

  const ringSize = count <= 2 ? 140 : count <= 4 ? 120 : 100;
  const ringR = ringSize / 2 - 8;
  const ringCirc = 2 * Math.PI * ringR;
  const dashOffset = ringProgress.interpolate({ inputRange: [0, 1], outputRange: [ringCirc, 0] });

  const statusText = count === 1
    ? `Waiting for ${players[0]?.name || 'Player'} to reconnect...`
    : count <= 4
    ? `Waiting for ${count} players to reconnect...`
    : `Waiting for ${count} players to reconnect...`;

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: "rgba(0,0,0,0.88)",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 100,
        },
      ]}
    >
      {/* Player avatars — grid for multiple players */}
      <Animated.View style={{ transform: [{ scale: pulse }], flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, maxWidth: 300 }}>
        {players.map((p) => (
          <View key={p.userId} style={{ alignItems: 'center', width: avatarSize + 20 }}>
            <View
              style={{
                width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2,
                backgroundColor: "rgba(239,68,68,0.15)",
                borderWidth: 2, borderColor: "rgba(239,68,68,0.4)",
                alignItems: "center", justifyContent: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: avatarFontSize, fontWeight: "900" }}>
                {p.name[0]?.toUpperCase() || "?"}
              </Text>
            </View>
            <Text style={{ color: "#F8FAFC", fontSize: 11, fontWeight: "700", marginTop: 4 }} numberOfLines={1}>
              {p.name}
            </Text>
            <Text style={{ color: "#EF4444", fontSize: 10, fontWeight: "600", marginTop: 2 }}>
              {formatTime(p.remainingMs)}
            </Text>
          </View>
        ))}
      </Animated.View>

      {/* Overall countdown ring */}
      <View style={{ marginTop: 20, alignItems: "center", justifyContent: "center" }}>
        <Svg width={ringSize} height={ringSize}>
          <Circle cx={ringSize / 2} cy={ringSize / 2} r={ringR} stroke="rgba(255,255,255,0.08)" strokeWidth={6} fill="none" />
          <AnimatedCircle
            cx={ringSize / 2} cy={ringSize / 2} r={ringR}
            stroke="#EF4444" strokeWidth={6} strokeLinecap="round"
            strokeDasharray={`${ringCirc} ${ringCirc}`}
            strokeDashoffset={dashOffset}
            fill="none"
            transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
          />
        </Svg>
        <View style={{ position: "absolute", alignItems: "center" }}>
          <Text style={{ color: "#fff", fontSize: 32, fontWeight: "900" }}>{minSeconds}</Text>
          <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>SECONDS</Text>
        </View>
      </View>

      {/* Status text */}
      <Text style={{ color: colors.text.secondary, fontSize: 14, textAlign: "center", marginTop: 12, marginHorizontal: 40 }}>
        {statusText}
      </Text>

      {/* Rotating tip */}
      <Animated.View style={{ opacity: tipFade, marginTop: 10, backgroundColor: "rgba(139,92,246,0.1)", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginHorizontal: 32, borderWidth: 1, borderColor: "rgba(139,92,246,0.2)" }}>
        <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "600", textAlign: "center" }}>
          {tips[tipIdx]}
        </Text>
      </Animated.View>

      {/* Exit button */}
      <TouchableOpacity
        style={{ marginTop: 24, backgroundColor: "rgba(239,68,68,0.15)", paddingHorizontal: 28, paddingVertical: 12, borderRadius: 20, borderWidth: 1, borderColor: "rgba(239,68,68,0.3)" }}
        onPress={onExit}
      >
        <Text style={{ color: "#EF4444", fontSize: 14, fontWeight: "700" }}>Exit Match</Text>
      </TouchableOpacity>
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * GamePlayModal — full-screen modal that hosts the game and its pre/post overlays.
 */
function GamePlayModal({
  session,
  onClose,
  onRematch,
}: {
  session: ActiveSession;
  onClose: () => void;
  onRematch?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { addMatch } = useGames();
  const { user } = useAuth();
  // Wait for players only when the game can actually connect (it needs
  // a wsToken to open the engine socket that sends READY — without one the
  // engine would never START and the waiting screen would deadlock).
  const canEngineConnect = !!session.wsToken;
  const [phase, setPhase] = useState<"prestart" | "playing" | "result">(
    session.isRejoin ? "playing" : "prestart",
  );
  const [score, setScore] = useState(0);
  const [result, setResult] = useState<"win" | "loss" | "draw" | "pending">(
    "pending",
  );
  const [xpEarned, setXpEarned] = useState(0);
  // Full reward rankings from backend — frontend auto-adopts to whatever
  // the backend returns. Each entry: { userId, result, rank, xpEarned, isBot }.
  const [rewardRankings, setRewardRankings] = useState<Array<{
    userId: string; result: string; rank: number; xpEarned: number; isBot?: boolean;
  }> | null>(null);
  // Per-game breakdown (accuracy / longest streak) surfaced on the result overlay
  const [gameStats, setGameStats] = useState<{
    accuracy?: number;
    longestStreak?: number;
  }>({});

  // In-game chat panel
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPanelH, setChatPanelH] = useState(0);
  const [chatUnread, setChatUnread] = useState(false);
  const [chatIncoming, setChatIncoming] = useState<{ name: string; text: string } | null>(null);
  // Game readiness — becomes true when the runtime is mounted, the socket
  // is connected, and critical assets are downloaded. The start screen uses
  // this to transition from "Loading game…" to "ALL READY!" instead of a
  // fixed countdown.
  const [gameReady, setGameReady] = useState(false);
  // Keyboard height — track so the game board shrinks upward when the
  // keyboard opens (especially important on iOS where the keyboard overlays).
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const sub1 = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates?.height || 0));
    const sub2 = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { sub1.remove(); sub2.remove(); };
  }, []);

  // Multi-round lifecycle — only active when configuredRounds > 1.
  // Provides round context (number, total, status) for header label + waiting screen.
  const roundLifecycle = useRoundLifecycle({
    matchId: session.matchId,
    configuredRounds: session.configuredRounds || 1,
  });

  // Per-player disconnect state — supports N simultaneous disconnects.
  // Each entry has { userId, name, remainingMs } for independent countdowns.
  const [disconnectedPlayers, setDisconnectedPlayers] = useState<
    Array<{ userId: string; name: string; remainingMs: number }>
  >([]);
  // Guards against double-completion: some games (e.g. TapRush) fire onComplete
  // from a local timer while the server also emits GAME_OVER, so completeGameSession
  // could run twice and hit "Session already completed".
  const completingRef = useRef(false);
  // Ensures the win/loss jingle fires exactly once per session even if both the
  // direct completion path and a MATCH_RESOLVED notification race each other.
  const resultSoundPlayedRef = useRef(false);
  // Lets the engine-socket listeners (registered once per match) call the
  // latest handleComplete without stale closures or effect re-subscription.
  const handleCompleteRef = useRef<(r: HtmlGameResult) => void>(() => {});

  useEffect(() => {
    const { DeviceEventEmitter } = require("react-native");

    const onPause = (event: any) => {
      if (event.matchId === session.matchId && event.data?.reconnectWindowMs) {
        // N-player disconnect support: server sends disconnectDetails[] with
        // per-player remaining time. Fall back to single-player mode.
        const details = event.data.disconnectDetails;
        if (Array.isArray(details) && details.length > 0) {
          const resolved = details.map((d: any) => {
            const p = (session.players || []).find((pl: any) => pl.id === d.userId);
            return {
              userId: d.userId,
              name: p?.name || "Player",
              remainingMs: d.remainingMs || 60000,
            };
          });
          setDisconnectedPlayers(resolved);
        } else {
          // Legacy single-player fallback
          const disconnectedId = event.data?.disconnectedPlayers?.[0] || event.data?.userId;
          const match = (session.players || []).find((p: any) => p.id === disconnectedId);
          setDisconnectedPlayers([{
            userId: disconnectedId || 'unknown',
            name: match?.name || "Opponent",
            remainingMs: event.data.reconnectWindowMs || 60000,
          }]);
        }
        setPhase((prev) => (prev === "result" ? prev : "playing"));
      }
    };

    const onResume = (event: any) => {
      if (event.matchId === session.matchId) {
        setDisconnectedPlayers([]);
        // Resume the game: the opponent reconnected and the engine is back
        // to ACTIVE. Without this the disconnect overlay disappears but the
        // game stays frozen on whatever phase was shown during the pause.
        setPhase((prev) => (prev === "result" ? prev : "playing"));
      }
    };

    // Rejoining an already-ACTIVE match — skip straight to the game.
    const onActive = (event: any) => {
      if (event.matchId === session.matchId) {
        setPhase("playing");
      }
    };

    // Reconnected to a match that already ENDED (forfeit / draw / we were
    // offline when it finished). The engine only sends GAME_OVER live — on a
    // reconnect it replies with CONNECT_ACK carrying the FINISHED state, which
    // the game component would otherwise misread as "waiting" and hang on
    // forever. Complete the session here so the result overlay appears.
    const onConnect = (event: any) => {
      if (event.matchId !== session.matchId) return;
      const st = event.data?.state?.status;
      // Signal game readiness — the socket is connected, the runtime has
      // received initial state, and assets were preloaded during matchmaking.
      // The start screen will transition from "Loading game…" to "ALL READY!"
      // and then call onDone to reveal the game.
      setGameReady(true);
      // If reconnecting to an already-finished match, complete immediately.
      if (st !== "FINISHED" && st !== "ARCHIVED") return;
      const winnerId = event.data?.state?.pluginState?.winner;
      const won = !!winnerId && String(winnerId) === String(user?.id);
      const draw = !!event.data?.state?.pluginState?.drawReason;
      handleCompleteRef.current({
        score: won ? 1 : 0,
        won,
        xpEarned: 0,
        durationSeconds: 0,
      });
    };

    const sub1 = DeviceEventEmitter.addListener("GAME_ENGINE_PAUSE", onPause);
    const sub2 = DeviceEventEmitter.addListener("GAME_ENGINE_RESUME", onResume);
    const sub3 = DeviceEventEmitter.addListener("GAME_ENGINE_OVER", onResume);
    const sub4 = DeviceEventEmitter.addListener("GAME_ENGINE_ACTIVE", onActive);
    const sub5 = DeviceEventEmitter.addListener("GAME_ENGINE_CONNECT", onConnect);
    // Games (Ludo, SnakeLadder, Scribble) can request the chat panel to open
    const sub6 = DeviceEventEmitter.addListener("OPEN_GAME_CHAT", () => setChatOpen(true));
    const sub7 = DeviceEventEmitter.addListener("GAME_ENGINE_CHAT", (event: any) => {
      if (event.matchId !== session.matchId) return;
      const d = event.data;
      const info = (session.players || []).find((p: any) => p.id === (d.userId || d.uid));
      setChatIncoming({
        name: info?.name || d.name || "Player",
        text: d.text || "",
      });
    });

    return () => {
      sub1.remove();
      sub2.remove();
      sub3.remove();
      sub4.remove();
      sub5.remove();
      sub6.remove();
      sub7.remove();
    };
  }, [session.matchId]);

  // Clear incoming chat message after it's been consumed by GameChatPanel
  useEffect(() => {
    if (chatIncoming) {
      const t = setTimeout(() => setChatIncoming(null), 500);
      return () => clearTimeout(t);
    }
  }, [chatIncoming]);

  // Per-player countdown: tick each disconnected player's remainingMs every second.
  useEffect(() => {
    if (disconnectedPlayers.length === 0) return;
    const timer = setInterval(() => {
      setDisconnectedPlayers((prev) =>
        prev
          .map((p) => ({ ...p, remainingMs: Math.max(0, p.remainingMs - 1000) }))
          .filter((p) => p.remainingMs > 0),
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [disconnectedPlayers.length > 0]);

  useEffect(() => {
    completingRef.current = false;
    resultSoundPlayedRef.current = false;
    setGameReady(false);
    setPhase(session.isRejoin ? "playing" : "prestart");
    setScore(0);
    setResult("pending");
    setXpEarned(0);
    setRewardRankings(null);
    setGameStats({});
    setDisconnectedPlayers([]);
  }, [session.matchId, session.sessionId]);

  // Resolve a pending PVP result when the server broadcasts the final outcome.
  // Uses a ref for the result guard so the listener is registered exactly once
  // per match — without the ref, including `result` in the dep array causes
  // the listener to re-register on every render (since result is set inside
  // the listener itself), and the stale closure can miss the "pending" check.
  const resultRef = useRef(result);
  useEffect(() => { resultRef.current = result; }, [result]);

  useEffect(() => {
    const onNotif = (notif: NotificationNewPayload) => {
      if (notif?.type !== "MATCH_RESOLVED") return;
      if (resultRef.current !== "pending") return;
      const payload = notif.payload || {};
      // Ignore stale resolutions from an earlier match (payload.matchId added
      // server-side; fall back to matchId/sessionId when absent).
      const notifMatchId = payload.matchId || payload.sessionId;
      if (notifMatchId && notifMatchId !== session.matchId) return;
      const resolved =
        payload.result === "WIN"
          ? "win"
          : payload.result === "DRAW"
            ? "draw"
            : "loss";
      setResult(resolved);
      setXpEarned(payload.xpEarned || 0);
      if (payload.reward?.rankings) setRewardRankings(payload.reward.rankings);
      if (payload.score != null) setScore(payload.score);
      // Server resolved the outcome (finish, forfeit, or draw) — always land
      // on the result overlay, even if the match was still in waiting/countdown.
      setPhase("result");
      // Live victory/defeat feedback when the pending result resolves
      if (!resultSoundPlayedRef.current) {
        resultSoundPlayedRef.current = true;
        if (payload.result === "WIN") {
          gameSound.playWin();
        } else if (payload.result !== "DRAW") {
          gameSound.playLoss();
        }
      }
    };

    accountSocket.events.on("notification:new", onNotif);
    return () => accountSocket.events.off("notification:new", onNotif);
  }, [session.matchId]);

  const handleComplete = async (gameResult: HtmlGameResult) => {
    if (completingRef.current) return;
    completingRef.current = true;
    try {
      let match;
      // Use the unified secure session completion for all matches
      const res = await gamesService.completeGameSession({
        sessionId: session.sessionId,
        tapLog: [],
      });
      match = res.data;

      setScore(match.score || gameResult.score);
      const finalResult =
        match.result === "WIN"
          ? "win"
          : match.result === "DRAW"
            ? "draw"
            : match.result === "PENDING"
              ? "pending"
              : "loss";
      setResult(finalResult);
      setXpEarned(match.xpEarned || 0);
      if (match.reward?.rankings) setRewardRankings(match.reward.rankings);
      setGameStats({
        accuracy: gameResult.accuracy,
        longestStreak: gameResult.longestStreak,
      });
      setPhase("result");
      // Victory/defeat feedback the moment the result is known
      if (!resultSoundPlayedRef.current) {
        resultSoundPlayedRef.current = true;
        if (finalResult === "win") {
          gameSound.playWin();
        } else if (finalResult === "loss") {
          gameSound.playLoss();
        }
      }
      if (!session.wsToken) await addMatch(match);
    } catch (error: any) {
      // The game is over either way. If the server rejected the completion
      // (already resolved / session expired / session not found / match not
      // finished), DON'T punish the player with an alert and a closed modal —
      // fall back to the local game result and render the overlay. The server
      // keeps its own authoritative record of the outcome.
      const msg = String(error?.response?.data?.message || "").toLowerCase();
      const benign =
        msg.includes("already completed") ||
        msg.includes("already resolved") ||
        msg.includes("session expired") ||
        msg.includes("session not found") ||
        msg.includes("not finished");
      if (benign) {
        // Don't clobber a result the server already returned on an earlier call.
        // Use the ref (not the closure) so the guard reads the live value —
        // setResult('win') above may have run in the same render cycle but the
        // closure still sees the old 'pending' snapshot.
        if (resultRef.current === "pending") {
          setScore(gameResult.score || 0);
          setResult(gameResult.won ? "win" : gameResult.won === false ? "loss" : "draw");
          setXpEarned(gameResult.xpEarned || 0);
          setGameStats({
            accuracy: gameResult.accuracy,
            longestStreak: gameResult.longestStreak,
          });
        }
        setPhase("result");
        return;
      }
      // Genuine network/server failure — re-arm so the completion can be
      // retried, but keep the player in the result screen rather than dumping
      // them out of the game.
      completingRef.current = false;
      themedAlert(
        "Game Error",
        error.response?.data?.message || "Could not save your game result.",
      );
    }
  };

  // Keep the engine-socket listeners pointed at the latest handler.
  handleCompleteRef.current = handleComplete;

  // Safety timeout: if the game doesn't become ready within 20s (stale
  // session, engine won't accept connection, etc.) close the session
  // instead of leaving the player stuck on the loading screen.
  useEffect(() => {
    if (gameReady || session.isRejoin) return;
    const timer = setTimeout(() => {
      if (!gameReady) {
        themedAlert(
          "Connection Timeout",
          "Could not connect to the game. Returning to the games screen.",
          [{ text: "OK", onPress: () => onClose() }],
        );
      }
    }, 20000);
    return () => clearTimeout(timer);
  }, [gameReady, session.matchId]);

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.playModal, { paddingTop: insets.top || 16 }]}>
        <View style={styles.playHeader}>
          <TouchableOpacity
            onPress={() => {
              Alert.alert(
                "Leave Game?",
                "Are you sure you want to leave? The game will continue with other players.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Leave Game",
                    style: "destructive",
                    onPress: () => {
                  // Tell the socket layer to send LEAVE to server (forfeit)
                  // BEFORE closing. This prevents the server from pausing
                  // and offering a "resume" on next entry.
                  DeviceEventEmitter.emit("GAME_LEAVE");
                  onClose();
                },
                  },
                ],
              );
            }}
            style={styles.iconButton}
          >
            <Ionicons name="log-out" size={22} color={colors.text.secondary} style={{ transform: [{ scaleX: -1 }] }} />
          </TouchableOpacity>
          <View style={styles.playHeaderCenter}>
            <View style={styles.playHeaderTitleRow}>
              <GameLogo game={session.game} size={26} radius={8} />
              <Text style={styles.playTitle}>{session.game.name}</Text>
              {roundLifecycle.showRoundLabel && (
                <View style={{ backgroundColor: 'rgba(124,58,237,0.2)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 }}>
                  <Text style={{ color: '#A78BFA', fontSize: 11, fontWeight: '700' }}>
                    R{roundLifecycle.currentRoundNumber}/{roundLifecycle.totalRounds}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.playHeaderRight}>
            {/* Chat button — toggles the in-game chat panel */}
            <TouchableOpacity
              onPress={() => {
                setChatOpen((p) => !p);
                setChatUnread(false);
              }}
              style={[styles.iconButton, chatOpen && { backgroundColor: "rgba(139, 92, 246, 0.25)" }]}
            >
              <View>
                <Ionicons
                  name={chatOpen ? "chatbubble" : "chatbubble-ellipses"}
                  size={18}
                  color={chatOpen ? "#A78BFA" : colors.text.secondary}
                />
                {chatUnread && !chatOpen && (
                  <View style={{ position: "absolute", top: -3, right: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444" }} />
                )}
              </View>
            </TouchableOpacity>
            {/* Score — shown during gameplay */}
            {score > 0 && (
              <View style={styles.scoreBox}>
                <Text style={styles.scoreLabel}>Score</Text>
                <Text style={styles.scoreValue}>{score}</Text>
              </View>
            )}
          </View>
        </View>

        {/* playStage: the game mounts as early as prestart so the runtime,
            socket connection, and assets are fully loaded by the time the
            countdown ends. During prestart the GameStartScreen overlays on top;
            during result the component unmounts immediately, freeing all native
            memory (video players, Animated values, PanResponder, intervals). */}
        <View style={[styles.playStage, (chatOpen || (Platform.OS === 'ios' && kbHeight > 0)) && { paddingBottom: (chatOpen ? (chatPanelH || 280) : 0) + (Platform.OS === 'ios' ? kbHeight : 0) }]}>
          {(phase === "playing" || phase === "prestart") && session.wsToken && (
            <View
              style={{ flex: 1 }}
              pointerEvents={phase === "prestart" ? "none" : "auto"}
            >
              <AppGameHost
                key={session.matchId}
                game={session.game as any}
                gameProps={{
                  matchId: session.matchId,
                  slug: session.game?.slug,
                  userId: user?.id || "",
                  wsToken: session.wsToken || "",
                  players: session.players || [],
                  externalPhase: phase === "playing" ? "playing" : "waiting",
                  myName: user?.username || user?.name || "You",
                  myAvatar: user?.avatarUrl || user?.avatar || null,
                  myLevel:
                    user?.level ??
                    (user?.totalXpEarned != null
                      ? Math.floor(user.totalXpEarned / 1000) + 1
                      : undefined),
                  opponentName: session.players?.[0]?.name || "Opponent",
                  onComplete: handleComplete,
                }}
              />
            </View>
          )}

          {phase === "prestart" && (
            <View style={StyleSheet.absoluteFill}>
              <GameStartScreen
                key={session.matchId}
                game={session.game}
                myName={user?.username || user?.name || "You"}
                myAvatar={user?.avatarUrl || user?.avatar || null}
                myTeam={session.myTeam}
                teamsLocked={session.teamsLocked}
                opponents={(session.players || []).map((p) => ({
                  id: p.id,
                  name: p.name,
                  avatar: p.avatar,
                  team: p.team,
                }))}
                modeLabel={
                  session.mode === "tournament"
                    ? "TOURNAMENT"
                    : session.mode === "practice"
                      ? "PRACTICE"
                      : session.mode === "custom"
                        ? "CUSTOM LOBBY"
                        : "AUTO MATCH"
                }
                ready={gameReady}
                onDone={() => setPhase("playing")}
                onExit={onClose}
                roundNumber={roundLifecycle.showRoundLabel ? roundLifecycle.currentRoundNumber : undefined}
                roundTotal={roundLifecycle.showRoundLabel ? roundLifecycle.totalRounds : undefined}
              />
            </View>
          )}

          {disconnectedPlayers.length > 0 && phase !== "result" && (
            <DisconnectOverlay
              players={disconnectedPlayers}
              onExit={onClose}
            />
          )}

          {phase === "result" && roundLifecycle.showRoundLabel && roundLifecycle.roundResult && !roundLifecycle.isMatchFinished && (
            <React.Suspense fallback={null}>
            <RoundResultOverlay
              roundResult={roundLifecycle.roundResult}
              userId={user?.id || ''}
              roundNumber={roundLifecycle.currentRoundNumber}
              totalRounds={roundLifecycle.totalRounds}
              playerNames={Object.fromEntries(
                (session.players || []).map((p) => [p.id, p.name])
              )}
            />
            </React.Suspense>
          )}

          {phase === "result" && (
            <React.Suspense fallback={null}>
            <GameResultOverlay
              key={result}
              result={result}
              score={score}
              xpEarned={xpEarned}
              rewardRankings={rewardRankings}
              accuracy={gameStats.accuracy}
              longestStreak={gameStats.longestStreak}
              gameName={session.game.name}
              modeLabel={
                session.mode === "tournament"
                  ? "TOURNAMENT"
                  : session.mode === "practice"
                    ? "PRACTICE"
                    : session.mode === "custom"
                      ? "CUSTOM LOBBY"
                      : "AUTO MATCH"
              }
              opponentName={session.players?.[0]?.name}
              isPractice={session.mode === "practice"}
              onRematch={onRematch}
              onClose={onClose}
            />
            </React.Suspense>
          )}
        </View>

        {/* In-game chat panel — shrinks the game area above it */}
        {phase === "playing" && (
          <GameChatPanel
            open={chatOpen}
            onClose={() => setChatOpen(false)}
            onPanelLayout={(h) => setChatPanelH(h)}
            playerName={user?.username || user?.name || "You"}
            incoming={chatIncoming}
            onUnread={() => {
              if (!chatOpen) setChatUnread(true);
            }}
          />
        )}
      </View>
    </Modal>
  );
}

