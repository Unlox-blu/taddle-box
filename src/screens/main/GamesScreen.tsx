import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  DeviceEventEmitter,
  Easing,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  ImageBackground,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { HomeStackParamList } from "../../types";
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
import PresenceDot from "../../components/common/PresenceDot";
import StateBlock from "../../components/common/StateBlock";
import ChessGame from "../../components/games/ChessGame";
import LudoGame from "../../components/games/LudoGame";
import SnakeLadderGame from "../../components/games/SnakeLadderGame";
import ScribbleGame from "../../components/games/ScribbleGame";
import WordRushGame from "../../components/games/WordRushGame";
import TapRushGame from "../../components/games/TapRushGame";
import MemoryGridGame from "../../components/games/MemoryGridGame";
import GameLogo from "../../components/games/GameLogo";
import GameStartScreen from "../../components/games/GameStartScreen";
import { GAME_ASSETS } from "../../games/assets";
import type { Game } from "../../types";
import type { HtmlGameResult } from "../../games/types";
import MatchModeModal from "../../components/games/MatchModeModal";
import GameResultOverlay from "../../components/games/GameResultOverlay";
import { socketClient } from "../../services/socketClient";
import type { User } from "../../types";
import { useAuth } from "../../context/AuthContext";
import TournamentLeaderboardModal from "../../components/games/TournamentLeaderboardModal";
import { gameSound, useGameSoundPrefs } from "../../services/gameSound";
import { themedAlert } from "../../components/common/ThemedAlert";
import GamesMatchmakingModal from "../../components/games/GamesMatchmakingModal";

type ActiveTab = "games" | "tournaments" | "history";
type ScreenModal = "none" | "history";

// Every game shows the cosmetic 3-2-1 countdown. Realtime games gate their
// own clocks (round timers, pattern reveals) on `externalPhase === "playing"`
// so the countdown never burns match time before the board is visible.
export type PlayerContext = {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
  team?: number;
  seat?: number;
  level?: number;
};

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

// Every game is rendered by a native React Native component (there is no HTML5
// webview renderer anymore). Some DB rows still carry a stale `html5_webview`
// runtime flag, so gate on the slug — never on the runtime metadata — or the
// game would never mount and matches would appear stuck in "waiting".
const NATIVE_GAME_SLUGS = new Set([
  "chess",
  "ludo",
  "snake-ladder",
  "scribble",
  "word-rush",
  "tap-rush",
  "memory-grid",
]);

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

  // Merge backend games with local assets, then order the display list so
  // trending games (top 3) appear FIRST, followed by the rest.
  const realGames: Game[] = useMemo(() => {
    if (!backendGames || backendGames.length === 0) return [];
    const merged = backendGames.map((bg) => {
      const assets = GAME_ASSETS[bg.slug] || GAME_ASSETS["tap-rush"];
      return {
        ...bg,
        emoji: bg.emoji || assets.emoji,
        gradient: bg.metadata?.gradient || assets.gradient,
        imageUrl: bg.thumbnail || assets.imageUrl,
        logo: assets.logo,
        entryFee: bg.metadata?.entryFee || bg.entryFee,
        prize: bg.metadata?.prize || bg.prize,
        averageDurationLabel:
          bg.metadata?.averageDurationLabel || assets.averageDurationLabel,
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

  const handleGamePlay = useCallback((game: Game, isRejoin: boolean) => {
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
    setSelectedGame(game);
    setMatchModalVisible(true);
  }, [reconnectSession, user]);

  const loadGamesData = useCallback(async () => {
    setLoading(true);
    try {
      await fetchGamesData();
    } catch (e) {
      console.warn("Failed to fetch games history", e);
    }
    try {
      const tournamentsRes = await gamesService.getTournaments(1, 20);
      setTournaments(tournamentsRes?.data || []);
    } catch (error) {
      console.warn("Failed to load tournaments", error);
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
        console.warn("Failed to load tournaments", error);
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

    const handleNewNotif = (notif: any) => {
      if (notif.type === "GAME_INVITE" || notif.type === "game_invite") {
        setIncomingInvite(notif);
      }
    };

    const handleSessionExpired = (data: any) => {
      setReconnectSession(null);
    };

    const subGamesModal = require("react-native").DeviceEventEmitter.addListener("openGamesMatchmaking", () => {
      setGlobalMatchModalVisible(true);
    });

    socketClient.events.on("notification:new", handleNewNotif);
    socketClient.events.on("SESSION_EXPIRED", handleSessionExpired);

    return () => {
      sub.remove();
      subGamesModal.remove();
      socketClient.events.off("notification:new", handleNewNotif);
      socketClient.events.off("SESSION_EXPIRED", handleSessionExpired);
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

          setActiveSession({
            game: request.game,
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
          });
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

  const handleSessionClose = () => {
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
                  {/* Sender avatar + live presence dot on the custom-match invite */}
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
                    <PresenceDot
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
            <View style={styles.gameGrid}>
              {realGames.map((game) => {
                const isRejoin =
                  !!reconnectSession && reconnectSession.gameId === game.id;
                const rejoinWindowMs = isRejoin
                  ? reconnectSession.reconnectWindowMs
                  : null;
                return (
                  <GameCard
                    key={game.id}
                    game={{
                      ...game,
                      isHot:
                        backendTrending?.includes(game.id) ||
                        backendTrending?.includes(game.slug || "") ||
                        false,
                    }}
                    isRejoin={isRejoin}
                    rejoinWindowMs={rejoinWindowMs}
                    onRejoinExpired={() => {
                      // Window expired — drop the stale session so the card
                      // reverts to a normal PLAY button.
                      setReconnectSession(null);
                      loadGamesData();
                    }}
                    onPlayClick={() => handleGamePlay(game, isRejoin)}
                  />
                );
              })}
            </View>
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
              tournaments.map((tournament) => {
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
              })
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

function GameCard({
  game,
  isRejoin,
  rejoinWindowMs,
  onPlayClick,
  onRejoinExpired,
}: {
  game: Game;
  isRejoin?: boolean;
  rejoinWindowMs?: number | null;
  onPlayClick: () => void;
  onRejoinExpired?: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState<number | null>(
    rejoinWindowMs != null ? Math.floor(rejoinWindowMs / 1000) : null,
  );

  const formatTime = (seconds: number) => {
    if (seconds >= 3600) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return `${h}h ${m}m`;
    }
    if (seconds >= 60) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}m ${s}s`;
    }
    return `${seconds}s`;
  };

  useEffect(() => {
    if (rejoinWindowMs != null) {
      setTimeLeft(Math.floor(rejoinWindowMs / 1000));
    } else {
      // Server didn't report a window (match still ACTIVE, or Redis snapshot
      // missing after a restart). Fall back to the standard 60s reconnect
      // window so a rejoin button ALWAYS shows a countdown and self-expires
      // instead of sitting on "REJOIN MATCH" with no seconds for a long time.
      // Non-rejoin cards keep timeLeft null so they never tick.
      setTimeLeft(isRejoin ? 60 : null);
    }
  }, [rejoinWindowMs, isRejoin]);

  useEffect(() => {
    if (!isRejoin || timeLeft === null || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft, isRejoin]);

  // When the reconnect window expires the match is forfeited server-side, so
  // the REJOIN button must revert to a normal PLAY card instead of showing
  // "REJOIN MATCH" forever (stale session left in state).
  useEffect(() => {
    if (isRejoin && timeLeft === 0) {
      const t = setTimeout(() => onRejoinExpired?.(), 1200);
      return () => clearTimeout(t);
    }
  }, [isRejoin, timeLeft, onRejoinExpired]);

  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.gameCard}>
      {game.logo ? (
        <ImageBackground
          source={game.logo}
          style={styles.gameArt}
          resizeMode="cover"
        >
          {game.isHot && <Text style={styles.gameBadge}>TRENDING</Text>}
        </ImageBackground>
      ) : game.imageUrl ? (
        <ImageBackground
          source={{ uri: game.imageUrl }}
          style={styles.gameArt}
          resizeMode="cover"
        >
          {game.isHot && <Text style={styles.gameBadge}>TRENDING</Text>}
        </ImageBackground>
      ) : (
        <LinearGradient
          colors={game.gradient as [string, string]}
          style={styles.gameArt}
        >
          <GameLogo game={game} size={52} radius={16} />
          {game.isHot && <Text style={styles.gameBadge}>TRENDING</Text>}
        </LinearGradient>
      )}
      <View style={styles.gameBody}>
        <Text style={styles.gameTitle} numberOfLines={1}>
          {game.name}
        </Text>
        <Text style={styles.gameMeta}>Earn Up to {game.maxXp} XP</Text>

        <TouchableOpacity style={{ marginTop: 12 }} onPress={onPlayClick}>
          <LinearGradient
            colors={
              isRejoin
                ? [colors.warning, "#FF8C00"]
                : [colors.primary, colors.cyanDark]
            }
            style={styles.primaryButton}
          >
            {isRejoin ? (
              <Ionicons name="play-forward" size={16} color="#fff" />
            ) : (
              <Ionicons name="play" size={16} color="#fff" />
            )}
            <Text style={styles.primaryButtonText}>
              {isRejoin
                ? `REJOIN MATCH ${timeLeft && timeLeft > 0 ? `(${formatTime(timeLeft)})` : ""}`
                : `PLAY | ${game.entryFee || 0} XP`}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function TournamentCard({
  tournament,
  game,
  onJoin,
  onPlay,
}: {
  tournament: GameTournament;
  game: Game;
  onJoin: () => void;
  onPlay: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const fill = Math.min(
    100,
    Math.round((tournament.playerCount / tournament.maxPlayers) * 100),
  );
  const isUpcoming = tournament.status === "UPCOMING";
  const joined = tournament.isJoined && !isUpcoming;

  return (
    <View style={styles.tournamentCard}>
      <View style={styles.tournamentTop}>
        <LinearGradient
          colors={game.gradient as [string, string]}
          style={styles.tournamentIcon}
        >
          <GameLogo game={game} size={38} radius={10} />
        </LinearGradient>
        <View style={styles.tournamentInfo}>
          <Text style={styles.tournamentTitle}>{tournament.title}</Text>
          <Text style={styles.tournamentMeta}>
            {tournament.gameName} | Ends in {formatTimeLeft(tournament.endsAt)}
          </Text>
        </View>
        <View
          style={[styles.statusPill, isUpcoming && styles.statusPillUpcoming]}
        >
          <Text
            style={[styles.statusText, isUpcoming && styles.statusTextUpcoming]}
          >
            {isUpcoming ? "UPCOMING" : tournament.status}
          </Text>
        </View>
      </View>

      <View style={styles.tournamentNumbers}>
        <InfoPill
          label="Players"
          value={`${tournament.playerCount}/${tournament.maxPlayers}`}
        />
        <InfoPill label="Entry" value={`${tournament.entryFeeXP} XP`} />
        <InfoPill label="Prize" value={`${tournament.prizeXP} XP`} />
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${fill}%` }]} />
      </View>

      {/* My rank: shown once the player has joined and played at least one match */}
      {joined && tournament.myRank != null && (
        <View style={styles.myRankRow}>
          <Ionicons name="podium-outline" size={16} color={colors.xpGold} />
          <Text style={styles.myRankText}>
            Your rank: #{tournament.myRank}{" "}
            <Text style={styles.myRankSub}>
              · {tournament.myScore || 0}{" "}
              {(tournament.myScore || 0) === 1 ? "win" : "wins"}
            </Text>
          </Text>
        </View>
      )}

      {isUpcoming ? (
        <View
          style={[styles.tournamentButton, styles.tournamentDisabledButton]}
        >
          <Ionicons name="time-outline" size={18} color={colors.text.muted} />
          <Text
            style={[styles.tournamentButtonText, { color: colors.text.muted }]}
          >
            {formatStartsIn(tournament.startsAt)}
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          onPress={joined ? onPlay : onJoin}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={
              joined
                ? [colors.primary, colors.cyanDark]
                : ["rgba(124,58,237,0.18)", "rgba(6,182,212,0.12)"]
            }
            style={[
              styles.tournamentButton,
              !joined && styles.tournamentJoinButton,
            ]}
          >
            <Ionicons
              name={joined ? "people-outline" : "add-circle-outline"}
              size={18}
              color={joined ? "#fff" : colors.primaryLight}
            />
            <Text
              style={[
                styles.tournamentButtonText,
                !joined && { color: colors.primaryLight },
              ]}
            >
              {joined ? "Find Tournament Opponent" : "Join Tournament"}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      )}
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
  // Wait for players only when the native game can actually connect (it needs
  // a wsToken to open the engine socket that sends READY — without one the
  // engine would never START and the waiting screen would deadlock).
  const canEngineConnect =
    NATIVE_GAME_SLUGS.has((session.game as any)?.slug) && !!session.wsToken;
  const [phase, setPhase] = useState<"prestart" | "playing" | "result">(
    session.isRejoin ? "playing" : "prestart",
  );
  const [score, setScore] = useState(0);
  const [result, setResult] = useState<"win" | "loss" | "draw" | "pending">(
    "pending",
  );
  const [xpEarned, setXpEarned] = useState(0);
  // Per-game breakdown (accuracy / longest streak) surfaced on the result overlay
  const [gameStats, setGameStats] = useState<{
    accuracy?: number;
    longestStreak?: number;
  }>({});

  const [opponentPausedCountdown, setOpponentPausedCountdown] = useState<
    number | null
  >(null);
  const [pausedPlayerName, setPausedPlayerName] = useState<string>("Opponent");
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
        setOpponentPausedCountdown(
          Math.floor(event.data.reconnectWindowMs / 1000),
        );
        // Resolve the disconnected player's name from the session players list.
        // The server sends the userId in disconnectedPlayers[0]; fall back to
        // "Opponent" when absent (bot matches, legacy payloads).
        const disconnectedId =
          event.data?.disconnectedPlayers?.[0] || event.data?.userId;
        const match = (session.players || []).find(
          (p) => p.id === disconnectedId,
        );
        setPausedPlayerName(match?.name || "Opponent");
      }
    };

    const onResume = (event: any) => {
      if (event.matchId === session.matchId) {
        setOpponentPausedCountdown(null);
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
      if (st !== "FINISHED" && st !== "ARCHIVED") return;
      const winnerId = event.data?.state?.pluginState?.winner;
      const won = !!winnerId && String(winnerId) === String(user?.id);
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

    return () => {
      sub1.remove();
      sub2.remove();
      sub3.remove();
      sub4.remove();
      sub5.remove();
    };
  }, [session.matchId]);

  useEffect(() => {
    if (opponentPausedCountdown === null || opponentPausedCountdown <= 0)
      return;
    const timer = setInterval(() => {
      setOpponentPausedCountdown((prev) => (prev && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [opponentPausedCountdown]);

  useEffect(() => {
    completingRef.current = false;
    resultSoundPlayedRef.current = false;
    setPhase(session.isRejoin ? "playing" : "prestart");
    setScore(0);
    setXpEarned(0);
    setGameStats({});
  }, [session.matchId, session.sessionId]);

  // Resolve a pending PVP result when the server broadcasts the final outcome
  useEffect(() => {
    const onNotif = (notif: any) => {
      if (notif?.type !== "MATCH_RESOLVED") return;
      if (result !== "pending") return;
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

    socketClient.events.on("notification:new", onNotif);
    return () => socketClient.events.off("notification:new", onNotif);
  }, [phase, result]);

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
        if (result === "pending") {
          setScore(gameResult.score || 0);
          setResult(gameResult.won ? "win" : "loss");
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

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.playModal, { paddingTop: insets.top || 16 }]}>
        <View style={styles.playHeader}>
          <TouchableOpacity onPress={onClose} style={styles.iconButton}>
            <Ionicons name="close" size={22} color={colors.text.secondary} />
          </TouchableOpacity>
          <View style={styles.playHeaderCenter}>
            <View style={styles.playHeaderTitleRow}>
              <GameLogo game={session.game} size={26} radius={8} />
              <Text style={styles.playTitle}>{session.game.name}</Text>
            </View>
          </View>
          {session.game.metadata?.runtime === "html5_webview" ? (
            <View style={styles.scoreBox}>
              <Text style={styles.scoreLabel}>Score</Text>
              <Text style={styles.scoreValue}>{score}</Text>
            </View>
          ) : (
            <View style={{ width: 38 }} />
          )}
        </View>

        {/* playStage: game mounts immediately so its socket connects and sends
            READY. It stays invisible until the prestart screen is done.
            GameStartScreen handles both "waiting for players" and "3-2-1"
            as a single unified screen — matchStarted drives the transition. */}
        <View style={styles.playStage}>
          {(phase === "prestart" || phase === "playing") &&
            (() => {
              const { slug } = session.game as any;
              const uid = user?.id || "";
              const token = session.wsToken || "";
              const mid = session.matchId;

              const GAME_COMPONENTS: Record<string, any> = {
                chess: ChessGame,
                ludo: LudoGame,
                "snake-ladder": SnakeLadderGame,
                scribble: ScribbleGame,
                "word-rush": WordRushGame,
                "tap-rush": TapRushGame,
                "memory-grid": MemoryGridGame,
              };

              if (NATIVE_GAME_SLUGS.has(slug)) {
                const NativeGame = GAME_COMPONENTS[slug];
                if (NativeGame && token) {
                  return (
                    <View
                      style={[
                        StyleSheet.absoluteFill,
                        { opacity: phase === "playing" ? 1 : 0 },
                      ]}
                      pointerEvents={phase === "playing" ? "auto" : "none"}
                    >
                      <NativeGame
                        key={mid}
                        matchId={mid}
                        userId={uid}
                        wsToken={token}
                        players={session.players || []}
                        externalPhase={
                          phase === "playing" ? "playing" : "waiting"
                        }
                        myName={user?.username || user?.name || "You"}
                        myAvatar={user?.avatarUrl || user?.avatar || null}
                        myLevel={
                          user?.level ??
                          (user?.totalXpEarned != null
                            ? Math.floor(user.totalXpEarned / 1000) + 1
                            : undefined)
                        }
                        opponentName={session.players?.[0]?.name || "Opponent"}
                        onComplete={handleComplete}
                      />
                    </View>
                  );
                }
              }
              return null;
            })()}

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
                onDone={() => setPhase("playing")}
                onExit={onClose}
              />
            </View>
          )}

          {opponentPausedCountdown !== null && phase !== "result" && (
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: "rgba(0,0,0,0.85)",
                  justifyContent: "center",
                  alignItems: "center",
                  zIndex: 100,
                },
              ]}
            >
              <Ionicons name="warning" size={64} color={colors.warning} />
              <Text
                style={{
                  color: "#fff",
                  fontSize: 24,
                  fontWeight: "bold",
                  marginTop: 16,
                }}
              >
                {pausedPlayerName} Disconnected
              </Text>
              <Text
                style={{
                  color: colors.text.secondary,
                  fontSize: 16,
                  textAlign: "center",
                  marginHorizontal: 32,
                  marginTop: 12,
                }}
              >
                Match paused — waiting for them to return…
              </Text>
              <Text
                style={{
                  color: colors.primaryLight,
                  fontSize: 36,
                  fontWeight: "900",
                  marginTop: 16,
                }}
              >
                {opponentPausedCountdown}s
              </Text>
              <TouchableOpacity
                style={{
                  marginTop: 40,
                  backgroundColor: colors.danger,
                  paddingHorizontal: 32,
                  paddingVertical: 14,
                  borderRadius: 24,
                }}
                onPress={onClose}
              >
                <Text
                  style={{ color: "#fff", fontSize: 16, fontWeight: "bold" }}
                >
                  Exit Match
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {phase === "result" && (
            <GameResultOverlay
              key={result}
              result={result}
              score={score}
              xpEarned={xpEarned}
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
          )}
        </View>
      </View>
    </Modal>
  );
}

function MatchRow({ match }: { match: GameMatch }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isWin = match.result === "win";
  const logoGame: Game = {
    id: match.gameId,
    name: match.gameName,
    emoji: match.gameEmoji,
    gradient:
      GAME_ASSETS[match.gameSlug || ""]?.gradient ||
      (["#7C3AED", "#0891B2"] as [string, string]),
    logo: GAME_ASSETS[match.gameSlug || ""]?.logo,
    slug: match.gameSlug,
    maxXp: 0,
    isHot: false,
  };
  return (
    <View style={styles.matchRow}>
      <View style={styles.matchIcon}>
        <GameLogo game={logoGame} size={32} radius={9} />
      </View>
      <View style={styles.matchBody}>
        <Text style={styles.matchTitle}>{match.gameName}</Text>
        <Text style={styles.matchMeta}>
          {match.opponent} | {match.duration}
        </Text>
      </View>
      <View style={styles.matchRight}>
        <Text
          style={[
            styles.matchResult,
            { color: isWin ? colors.success : colors.danger },
          ]}
        >
          {isWin ? "WIN" : "LOSS"}
        </Text>
        <Text style={styles.matchXp}>+{match.xpEarned} XP</Text>
      </View>
    </View>
  );
}

function HistoryModal({
  visible,
  matches,
  onClose,
}: {
  visible: boolean;
  matches: GameMatch[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.modalShell, { paddingTop: insets.top || 16 }]}>
        <ModalHeader title="Match History" onClose={onClose} />
        <ScrollView contentContainerStyle={styles.modalContent}>
          {matches.map((match) => (
            <MatchRow key={match.id} match={match} />
          ))}
          {matches.length === 0 && (
            <StateBlock
              card
              title="No matches yet"
              subtitle="Your saved game sessions will appear here."
            />
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function ModalHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.modalHeader}>
      <TouchableOpacity onPress={onClose}>
        <Ionicons name="close" size={24} color={colors.text.secondary} />
      </TouchableOpacity>
      <Text style={styles.modalTitle}>{title}</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

/**
 * GameSettingsModal — game-specific settings (like Wallet's SettingsModal),
 * opened from the Games tab header gear. Kept separate from the global
 * Settings screen: sound effects + haptics for the game flow only.
 */
function GameSettingsModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { soundEnabled, hapticsEnabled, setSoundEnabled, setHapticsEnabled } =
    useGameSoundPrefs();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.modalShell, { paddingTop: insets.top || 16 }]}>
        <ModalHeader title="Game Settings" onClose={onClose} />
        <ScrollView contentContainerStyle={styles.modalContent}>
          <Text style={styles.settingsSection}>Audio & Feedback</Text>
          <View style={styles.settingsCard}>
            <View style={styles.settingsRow}>
              <View style={styles.settingsRowLeft}>
                <Ionicons
                  name="volume-high-outline"
                  size={20}
                  color={colors.primaryLight}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingsRowLabel}>Sound Effects</Text>
                  <Text style={styles.settingsRowDesc}>
                    Countdown beeps and game sounds
                  </Text>
                </View>
              </View>
              <Switch
                value={soundEnabled}
                onValueChange={(v) => setSoundEnabled(v)}
                trackColor={{ false: colors.bg.elevated, true: colors.primary }}
                thumbColor={soundEnabled ? "#fff" : colors.text.muted}
              />
            </View>
            <View
              style={[
                styles.settingsRow,
                { borderTopWidth: 1, borderTopColor: colors.border },
              ]}
            >
              <View style={styles.settingsRowLeft}>
                <Ionicons
                  name="phone-portrait-outline"
                  size={20}
                  color={colors.primaryLight}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingsRowLabel}>Haptics</Text>
                  <Text style={styles.settingsRowDesc}>
                    Vibration feedback while playing
                  </Text>
                </View>
              </View>
              <Switch
                value={hapticsEnabled}
                onValueChange={(v) => setHapticsEnabled(v)}
                trackColor={{ false: colors.bg.elevated, true: colors.primary }}
                thumbColor={hapticsEnabled ? "#fff" : colors.text.muted}
              />
            </View>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg.base },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.bg.card,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    statsRow: {
      flexDirection: "row",
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.md,
    },
    onlinePill: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(16, 185, 129, 0.15)",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: "rgba(16, 185, 129, 0.3)",
    },
    onlineDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.success,
      marginRight: 6,
    },
    onlineText: {
      fontSize: fontSizes.xs,
      fontWeight: "700",
      color: c.success,
    },
    content: { paddingBottom: 110 },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },
    sectionTitle: {
      fontSize: fontSizes.sm,
      color: c.text.secondary,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    sectionAction: {
      fontSize: fontSizes.xs,
      color: c.primaryLight,
      fontWeight: "700",
    },
    gameGrid: {
      paddingHorizontal: spacing.lg,
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
    },
    gameCard: {
      width: "48%",
      marginBottom: spacing.md,
      borderRadius: radii.lg,
      overflow: "hidden",
      backgroundColor: c.bg.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    gameArt: { height: 100, alignItems: "center", justifyContent: "center" },
    gameBadge: {
      position: "absolute",
      top: 6,
      right: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radii.full,
      overflow: "hidden",
      backgroundColor: "rgba(239,68,68,0.9)",
      color: "#fff",
      fontSize: 8,
      fontWeight: "900",
    },
    gameBody: { padding: spacing.sm },
    gameTitle: {
      fontSize: fontSizes.md,
      fontWeight: "800",
      color: c.text.primary,
    },
    gameMeta: { marginTop: 2, fontSize: 11, color: c.text.muted },
    primaryButton: {
      height: 36,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      borderRadius: radii.md,
    },
    primaryButtonText: {
      color: "#fff",
      fontSize: fontSizes.sm,
      fontWeight: "800",
    },
    tournamentCard: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      padding: spacing.md,
      borderRadius: radii.lg,
      backgroundColor: c.bg.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    tournamentTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    tournamentIcon: {
      width: 50,
      height: 50,
      borderRadius: radii.md,
      alignItems: "center",
      justifyContent: "center",
    },
    tournamentInfo: { flex: 1 },
    tournamentTitle: {
      fontSize: fontSizes.md,
      fontWeight: "800",
      color: c.text.primary,
    },
    tournamentMeta: {
      marginTop: 2,
      fontSize: fontSizes.xs,
      color: c.text.muted,
    },
    statusPill: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radii.full,
      backgroundColor: "rgba(16,185,129,0.14)",
    },
    statusText: { fontSize: 10, fontWeight: "800", color: c.success },
    statusPillUpcoming: {
      backgroundColor: "rgba(251,191,36,0.12)",
      borderWidth: 1,
      borderColor: "rgba(251,191,36,0.35)",
    },
    statusTextUpcoming: { color: "#FBBF24" },
    myRankRow: {
      marginTop: spacing.md,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: radii.md,
      backgroundColor: "rgba(251,191,36,0.08)",
      borderWidth: 1,
      borderColor: "rgba(251,191,36,0.25)",
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    myRankText: {
      flex: 1,
      fontSize: fontSizes.sm,
      fontWeight: "800",
      color: c.text.primary,
    },
    myRankSub: {
      fontSize: fontSizes.xs,
      fontWeight: "600",
      color: c.text.muted,
    },
    tournamentNumbers: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    infoPill: {
      flex: 1,
      padding: 9,
      borderRadius: radii.md,
      backgroundColor: c.bg.elevated,
      alignItems: "center",
    },
    infoValue: {
      fontSize: fontSizes.sm,
      fontWeight: "800",
      color: c.text.primary,
    },
    infoLabel: { marginTop: 2, fontSize: 10, color: c.text.muted },
    progressTrack: {
      height: 5,
      marginTop: spacing.md,
      borderRadius: radii.full,
      backgroundColor: c.bg.elevated,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      borderRadius: radii.full,
      backgroundColor: c.primaryLight,
    },
    tournamentButton: {
      height: 44,
      marginTop: spacing.md,
      borderRadius: radii.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    tournamentJoinButton: {
      borderWidth: 1,
      borderColor: "rgba(124,58,237,0.28)",
    },
    tournamentDisabledButton: {
      backgroundColor: c.bg.elevated,
      borderWidth: 1,
      borderColor: c.border,
    },
    tournamentButtonText: {
      color: "#fff",
      fontSize: fontSizes.sm,
      fontWeight: "800",
    },
    playModal: { flex: 1, backgroundColor: "#05050F" },
    playStage: {
      flex: 1,
      overflow: "hidden",
      backgroundColor: "#05050F",
    },
    waitingWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.xl,
      backgroundColor: "#05050F",
    },
    waitingModePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: spacing.md,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: radii.full,
      backgroundColor: "rgba(124,58,237,0.16)",
      borderWidth: 1,
      borderColor: "rgba(124,58,237,0.4)",
    },
    waitingModeText: {
      color: c.primaryLight,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1.5,
    },
    waitingTitle: {
      marginTop: spacing.lg,
      color: "#F8FAFC",
      fontSize: 24,
      fontWeight: "900",
      letterSpacing: 0.5,
    },
    waitingSub: {
      marginTop: spacing.sm,
      color: "#94A3B8",
      fontSize: fontSizes.sm,
      textAlign: "center",
      lineHeight: 19,
      maxWidth: 320,
    },
    waitingRoster: {
      marginTop: spacing.xl,
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: spacing.md,
    },
    waitingPlayer: {
      alignItems: "center",
      width: 72,
    },
    waitingAvatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: "rgba(255,255,255,0.22)",
    },
    waitingAvatarText: {
      color: "#fff",
      fontSize: 20,
      fontWeight: "900",
    },
    waitingName: {
      marginTop: 8,
      color: "#E2E8F0",
      fontSize: 12,
      fontWeight: "700",
      maxWidth: "100%",
    },
    waitingTag: {
      marginTop: 3,
      color: "#64748B",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.2,
    },
    waitingDots: {
      marginTop: spacing.xl,
      alignItems: "center",
      gap: 10,
    },
    waitingHint: {
      color: "#64748B",
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.4,
    },
    waitingExit: {
      position: "absolute",
      top: spacing.md,
      right: spacing.lg,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: radii.full,
      backgroundColor: "rgba(255,255,255,0.06)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.14)",
    },
    waitingExitText: {
      color: "#94A3B8",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.2,
    },
    playHeader: {
      minHeight: 68,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(255,255,255,0.08)",
    },
    playHeaderCenter: { flex: 1, alignItems: "center" },
    playHeaderTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    playTitle: { color: "#fff", fontSize: fontSizes.md, fontWeight: "900" },
    playSubtitle: { marginTop: 2, color: "#94A3B8", fontSize: fontSizes.xs },
    scoreBox: { width: 58, alignItems: "flex-end" },
    scoreLabel: { color: "#94A3B8", fontSize: 10, fontWeight: "700" },
    scoreValue: { color: "#fff", fontSize: fontSizes.lg, fontWeight: "900" },
    matchRow: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: c.bg.card,
      borderWidth: 1,
      borderColor: c.border,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    matchIcon: {
      width: 42,
      height: 42,
      borderRadius: radii.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.bg.elevated,
    },
    matchBody: { flex: 1 },
    matchTitle: {
      color: c.text.primary,
      fontSize: fontSizes.sm,
      fontWeight: "800",
    },
    matchMeta: { marginTop: 2, color: c.text.muted, fontSize: fontSizes.xs },
    matchRight: { alignItems: "flex-end" },
    matchResult: { fontSize: fontSizes.xs, fontWeight: "900" },
    matchXp: {
      marginTop: 2,
      color: c.xpGold,
      fontSize: fontSizes.xs,
      fontWeight: "800",
    },
    modalShell: { flex: 1, backgroundColor: c.bg.base },
    modalHeader: {
      height: 56,
      paddingHorizontal: spacing.lg,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    modalTitle: {
      color: c.text.primary,
      fontSize: fontSizes.lg,
      fontWeight: "900",
    },
    modalContent: { paddingVertical: spacing.md, paddingBottom: 50 },
    settingsSection: {
      fontSize: fontSizes.xs,
      fontWeight: "800",
      color: c.text.muted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      paddingHorizontal: spacing.lg,
      marginTop: spacing.lg,
      marginBottom: 6,
    },
    settingsCard: {
      marginHorizontal: spacing.lg,
      backgroundColor: c.bg.card,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: "hidden",
    },
    settingsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: spacing.md,
    },
    settingsRowLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1,
    },
    settingsRowLabel: {
      fontSize: fontSizes.sm,
      fontWeight: "600",
      color: c.text.primary,
    },
    settingsRowDesc: {
      fontSize: fontSizes.xs,
      color: c.text.muted,
      marginTop: 2,
    },
    inviteBanner: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      padding: spacing.md,
      backgroundColor: c.primary,
      borderRadius: radii.xl,
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
    },
    inviteBannerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 12,
    },
    inviteAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(255,255,255,0.25)",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    inviteBannerText: {
      color: "#fff",
      fontSize: fontSizes.md,
      fontWeight: "700",
      flex: 1,
    },
    inviteBannerActions: {
      flexDirection: "row",
      gap: 12,
    },
    inviteJoinBtn: {
      flex: 1,
      backgroundColor: "#fff",
      paddingVertical: 8,
      borderRadius: radii.md,
      alignItems: "center",
    },
    inviteJoinBtnText: {
      color: c.primary,
      fontSize: fontSizes.sm,
      fontWeight: "800",
    },
    inviteDenyBtn: {
      flex: 1,
      backgroundColor: "rgba(255,255,255,0.2)",
      paddingVertical: 8,
      borderRadius: radii.md,
      alignItems: "center",
    },
    inviteDenyBtnText: {
      color: "#fff",
      fontSize: fontSizes.sm,
      fontWeight: "700",
    },
  });
}
