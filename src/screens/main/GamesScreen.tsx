import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
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
import ChessGame from "../../components/games/ChessGame";
import LudoGame from "../../components/games/LudoGame";
import SnakeLadderGame from "../../components/games/SnakeLadderGame";
import ScribbleGame from "../../components/games/ScribbleGame";
import WordRushGame from "../../components/games/WordRushGame";
import TapRushGame from "../../components/games/TapRushGame";
import MemoryGridGame from "../../components/games/MemoryGridGame";
import { GAME_ASSETS } from "../../games/assets";
import type { Game } from "../../types";
import type { HtmlGameResult } from "../../games/types";
import MatchModeModal, {
  MatchMode,
} from "../../components/games/MatchModeModal";
import { apiClient } from "../../services/apiClient";
import { socketClient } from "../../services/socketClient";
import type { User } from "../../types";
import { useAuth } from "../../context/AuthContext";
import TournamentLeaderboardModal from "../../components/games/TournamentLeaderboardModal";

type ActiveTab = "games" | "tournaments" | "history";
type ScreenModal = "none" | "history";
type QueueRequest = {
  game: Game;
  mode: "auto" | "tournament" | "invite";
  tournamentId?: string;
  matchGroupId?: string;
  targetPlayers?: number;
  lobbyId?: string;
};
export type PlayerContext = {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
  team?: number;
  seat?: number;
};

type ActiveSession = {
  game: Game;
  mode: PlayMode;
  matchId: string;
  sessionId: string;
  wsToken?: string;
  players?: PlayerContext[];
  tournamentId?: string;
};

const MATCH_MODE_LABEL: Record<PlayMode, string> = {
  bot: "Bot Match",
  auto: "Real Match",
  tournament: "Tournament Match",
};

const modeToApi = (mode: "auto" | "tournament" | "invite") =>
  mode === "tournament" ? "TOURNAMENT" : mode === "invite" ? "CUSTOM" : "AUTO";

const formatTimeLeft = (endsAt: string) => {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const hours = Math.floor(diff / 36e5);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  return `${hours}h`;
};

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
  } = useGames();

  // Merge backend games with local assets
  const realGames: Game[] = useMemo(() => {
    if (!backendGames || backendGames.length === 0) return [];
    return backendGames.map((bg) => {
      const assets = GAME_ASSETS[bg.slug] || GAME_ASSETS["tap-rush"];
      return {
        ...bg,
        emoji: bg.emoji || assets.emoji,
        gradient: bg.metadata?.gradient || assets.gradient,
        imageUrl: bg.thumbnail || assets.imageUrl,
        entryFee: bg.metadata?.entryFee || bg.entryFee,
        prize: bg.metadata?.prize || bg.prize,
        averageDurationLabel:
          bg.metadata?.averageDurationLabel || assets.averageDurationLabel,
      };
    });
  }, [backendGames]);

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
  const [startingId, setStartingId] = useState<string | null>(null);
  const [incomingInvite, setIncomingInvite] = useState<any>(null);
  const [queueRequest, setQueueRequest] = useState<QueueRequest | null>(null);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(
    null,
  );
  
  const [leaderboardModalVisible, setLeaderboardModalVisible] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<GameTournament | null>(null);
  const [reconnectSession, setReconnectSession] = useState<any>(null);
  const [matchModalVisible, setMatchModalVisible] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [incomingInviteCode, setIncomingInviteCode] = useState<string | null>(null);

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

  useFocusEffect(
    useCallback(() => {
      loadGamesData();
    }, [loadGamesData])
  );

  useEffect(() => {
    const sub = require("react-native").DeviceEventEmitter.addListener(
      "GAME_INVITE_ACCEPTED",
      (payload: any) => {
        const gameId = payload?.gameId;
        const matchGroupId = payload?.matchGroupId;
        const game = realGamesRef.current.find((g) => g.id === gameId || g.slug === gameId);
        
        if (game && matchGroupId) {
          setActiveTab("games");
          setQueueRequest({
            game,
            mode: "invite",
            matchGroupId,
          });
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

    socketClient.events.on("notification:new", handleNewNotif);
    socketClient.events.on("SESSION_EXPIRED", handleSessionExpired);

    return () => {
      sub.remove();
      socketClient.events.off("notification:new", handleNewNotif);
      socketClient.events.off("SESSION_EXPIRED", handleSessionExpired);
    };
  }, []);

  const startBotSession = async (game: Game) => {
    if (!user || user.xp < (game.entryFee || 0)) {
      Alert.alert(
        "Insufficient XP",
        `You need ${game.entryFee || 0} XP to play ${game.name}.`,
      );
      return;
    }
    setStartingId(`${game.id}:bot`);
    try {
      const res = await gamesService.startGameSession(game.id, "bot");
      setActiveSession({
        game,
        mode: "bot",
        matchId: res.data.ticket?.userMatchId || res.data.sessionId,
        sessionId: res.data.sessionId,
        wsToken: res.data.wsToken,
        players: [{
          id: 'bot_1',
          name: 'AI Bot',
          avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Bot'
        }],
      });
    } catch (error: any) {
      Alert.alert(
        "Game Error",
        error.response?.data?.message || "Could not start practice.",
      );
    } finally {
      setStartingId(null);
    }
  };

  const joinTournament = async (tournament: GameTournament) => {
    const run = async () => {
      try {
        const res = await gamesService.joinTournament(tournament.id);
        setTournaments((prev) =>
          prev.map((item) => (item.id === tournament.id ? res.data : item)),
        );
      } catch (error: any) {
        Alert.alert(
          "Tournament Error",
          error.response?.data?.message || "Could not join tournament.",
        );
      }
    };

    if (tournament.entryFeeXP > 0 && !tournament.isJoined) {
      Alert.alert("Join Tournament", `Entry fee: ${tournament.entryFeeXP} XP`, [
        { text: "Cancel", style: "cancel" },
        { text: "Join", onPress: run },
      ]);
      return;
    }

    await run();
  };

  const startQueue = (req: QueueRequest) => {
    if (
      req.mode !== "tournament" &&
      (!user || user.xp < (req.game.entryFee || 0))
    ) {
      Alert.alert(
        "Insufficient XP",
        `You need ${req.game.entryFee || 0} XP to play ${req.game.name}.`,
      );
      return;
    }
    setQueueRequest(req);
  };

  const handleLobbyReady = useCallback(
    (_request: QueueRequest, _response: MatchmakingResponse) => {
      setQueueRequest(null);
      setMatchModalVisible(false);
      setSelectedGame(null);
    },
    [],
  );

  const handleMatched = useCallback(
    (request: QueueRequest, response: MatchmakingResponse) => {
      // Modal already closed itself — just start the session
      setQueueRequest(null);
      setMatchModalVisible(false);
      setSelectedGame(null);

      const sessionMode =
        request.mode === "tournament" ? "tournament"
        : request.mode === "invite" ? "custom"
        : "auto";

      // Pull matchGroupId from every possible location the server returns it
      // In the new lobby flow: lobbyId IS the match group identifier
      const matchGroupId =
        response.matchMetadata?.matchGroupId
        || response.matchMetadata?.lobbyId
        || response.match?.metadata?.matchGroupId
        || response.ticket?.matchGroupId
        || (response as any).lobbyId
        || null;

      gamesService
        .startGameSession(request.game.id, sessionMode, matchGroupId)
        .then((res) => {
          // Build opponent list from whatever the server returned
          const players: PlayerContext[] = [];

          // From matchMetadata.playerSnapshots (new lobby flow)
          const snapshots: any[] = (response as any).matchMetadata?.playerSnapshots || [];
          snapshots.forEach((p: any) => {
            if (p.id !== user?.id && !p.isBot) {
              players.push({
                id: p.id,
                name: p.displayName || p.username || "Opponent",
                username: p.username,
                avatar: p.avatar,
              });
            }
          });

          // Fallback: legacy opponent field
          if (players.length === 0 && response.opponent) {
            players.push({
              id: response.opponent.id || response.opponent.userId || "opponent",
              name: response.opponent.name || response.opponent.username || "Opponent",
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
            mode: request.mode === "tournament" ? "tournament" : "auto",
            matchId:
              res.data?.ticket?.userMatchId
              || res.data?.sessionId
              || (response as any).matchMetadata?.playerSnapshots?.[0]?.id
              || response.match?.id,
            sessionId: res.data?.sessionId || response.match?.id,
            wsToken: res.data?.wsToken || res.data?.ticket?.token,
            players: players.length > 0 ? players : undefined,
            tournamentId: request.tournamentId,
          });
        })
        .catch((err: any) => {
          Alert.alert(
            "Error",
            err?.response?.data?.message || "Failed to initialize the game session.",
          );
        });
    },
    [user?.id],
  );

  const handleSessionClose = () => {
    setActiveSession(null);
    loadGamesData();
  };

  // handleModeSelect is kept for tournament flow (called from TournamentCard)
  const handleModeSelect = useCallback(async (_mode: MatchMode, _targetPlayers: number | "auto") => {
    setMatchModalVisible(false);
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <MainHeader />

      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Game Zone</Text>
          <Text style={styles.subtitle}>
            Compete, climb rankings, and earn XP.
          </Text>
        </View>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() =>
            navigation.navigate("Leaderboards", { initialTab: "Games" })
          }
        >
          <Ionicons
            name="trophy-outline"
            size={20}
            color={colors.text.secondary}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.tabRow}>
        {(["games", "tournaments", "history"] as ActiveTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.tabTextActive,
              ]}
            >
              {tab === "games"
                ? "Games"
                : tab === "tournaments"
                  ? "Tournaments"
                  : "History"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {incomingInvite && (
        <View style={styles.inviteBanner}>
          <Text style={styles.inviteBannerText}>
            {(incomingInvite.message || "You have a new game invite!").split('|')[0].trim()}
          </Text>
          <View style={styles.inviteBannerActions}>
            <TouchableOpacity
              style={styles.inviteJoinBtn}
              onPress={() => {
                // Message format: "<text> | <lobbyId> | <inviteCode>"
                const parts = (incomingInvite.message || "").split("|").map((s: string) => s.trim());
                const inviteCode = parts[2] || parts[1];
                const gameId = incomingInvite.resourceId;
                const game = realGamesRef.current.find((g) => g.id === gameId || g.slug === gameId);

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

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await loadGamesData();
              setRefreshing(false);
            }}
            tintColor={colors.primaryLight}
          />
        }
      >
        {activeTab === "games" && (
          <>
            <SectionHeader title="Available Games" />
            <View style={styles.gameGrid}>
              {realGames.map((game) => {
                const isRejoin = !!reconnectSession && reconnectSession.gameId === game.id;
                const rejoinWindowMs = isRejoin ? reconnectSession.reconnectWindowMs : null;
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
                  startingId={startingId}
                  isRejoin={isRejoin}
                  rejoinWindowMs={rejoinWindowMs}
                  onPlayClick={() => {
                    if (isRejoin) {
                      setActiveSession(reconnectSession);
                      setReconnectSession(null); // Clear from banner so it opens fresh
                      return;
                    }
                    if (!user || user.xp < (game.entryFee || 0)) {
                      Alert.alert(
                        "Insufficient XP",
                        `You need ${game.entryFee || 0} XP to play ${game.name}.`,
                      );
                      return;
                    }
                    setSelectedGame(game);
                    setMatchModalVisible(true);
                  }}
                />
              )})}
            </View>
          </>
        )}

        {activeTab === "tournaments" && (
          <>
            <SectionHeader title="Active Tournaments" />
            {loading && tournaments.length === 0 ? (
              <LoadingBlock label="Loading tournaments" />
            ) : tournaments.length === 0 ? (
              <EmptyBlock
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
                      onPlay={() =>
                        startQueue({
                          game,
                          mode: "tournament",
                          tournamentId: tournament.id,
                        })
                      }
                    />
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}

        {activeTab === "history" && (
          <>
            <SectionHeader
              title="Recent Matches"
              action="Open"
              onPress={() => setScreenModal("history")}
            />
            {matches.length === 0 ? (
              <EmptyBlock
                title="No matches yet"
                subtitle="Play a practice or real match to build your record."
              />
            ) : (
              matches.map((match) => <MatchRow key={match.id} match={match} />)
            )}
          </>
        )}
      </ScrollView>

      <MatchModeModal
        visible={matchModalVisible}
        game={selectedGame}
        initialInviteCode={incomingInviteCode}
        onClose={() => {
          setMatchModalVisible(false);
          setIncomingInviteCode(null);
        }}
        onStartMatch={handleModeSelect}
        onMatched={handleMatched}
        onLobbyReady={handleLobbyReady}
        onTimeoutFallback={(req) => {
          setQueueRequest(null);
          setMatchModalVisible(false);
          Alert.alert(
            "No Opponent Found",
            "No players are currently available. You have been placed in a match against an AI bot.",
          );
          startBotSession(req.game);
        }}
      />

      {activeSession && (
        <GamePlayModal session={activeSession} onClose={handleSessionClose} />
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
    </View>
  );
}

function SectionHeader({
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
  startingId,
  isRejoin,
  rejoinWindowMs,
  onPlayClick,
}: {
  game: Game;
  startingId: string | null;
  isRejoin?: boolean;
  rejoinWindowMs?: number | null;
  onPlayClick: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState<number | null>(
    rejoinWindowMs != null ? Math.floor(rejoinWindowMs / 1000) : null
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
      setTimeLeft(null);
    }
  }, [rejoinWindowMs]);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isStarting = startingId === `${game.id}:bot`;

  return (
    <View style={styles.gameCard}>
      {game.imageUrl ? (
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
          <Text style={styles.gameGlyph}>{game.emoji}</Text>
          {game.isHot && <Text style={styles.gameBadge}>TRENDING</Text>}
        </LinearGradient>
      )}
      <View style={styles.gameBody}>
        <Text style={styles.gameTitle} numberOfLines={1}>
          {game.name}
        </Text>
        <Text style={styles.gameMeta}>Earn Up to {game.maxXp} XP</Text>

        <TouchableOpacity
          style={{ marginTop: 12 }}
          onPress={onPlayClick}
          disabled={isStarting}
        >
          <LinearGradient
            colors={isRejoin ? [colors.warning, "#FF8C00"] : [colors.primary, colors.cyanDark]}
            style={styles.primaryButton}
          >
            {isStarting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : isRejoin ? (
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

  return (
    <View style={styles.tournamentCard}>
      <View style={styles.tournamentTop}>
        <LinearGradient
          colors={game.gradient as [string, string]}
          style={styles.tournamentIcon}
        >
          <Text style={styles.tournamentGlyph}>{game.emoji}</Text>
        </LinearGradient>
        <View style={styles.tournamentInfo}>
          <Text style={styles.tournamentTitle}>{tournament.title}</Text>
          <Text style={styles.tournamentMeta}>
            {tournament.gameName} | Ends in {formatTimeLeft(tournament.endsAt)}
          </Text>
        </View>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{tournament.status}</Text>
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

      <TouchableOpacity
        onPress={tournament.isJoined ? onPlay : onJoin}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={
            tournament.isJoined
              ? [colors.primary, colors.cyanDark]
              : ["rgba(124,58,237,0.18)", "rgba(6,182,212,0.12)"]
          }
          style={[
            styles.tournamentButton,
            !tournament.isJoined && styles.tournamentJoinButton,
          ]}
        >
          <Ionicons
            name={tournament.isJoined ? "people-outline" : "add-circle-outline"}
            size={18}
            color={tournament.isJoined ? "#fff" : colors.primaryLight}
          />
          <Text
            style={[
              styles.tournamentButtonText,
              !tournament.isJoined && { color: colors.primaryLight },
            ]}
          >
            {tournament.isJoined
              ? "Find Tournament Opponent"
              : "Join Tournament"}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
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

function QueueModal({
  request,
  onClose,
  onMatched,
  onLobbyReady,
  onTimeoutFallback,
}: {
  request: QueueRequest | null;
  onClose: () => void;
  onMatched: (request: QueueRequest, response: MatchmakingResponse) => void;
  onLobbyReady?: (request: QueueRequest, response: MatchmakingResponse) => void;
  onTimeoutFallback?: (request: QueueRequest) => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [lobbyId, setLobbyId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("Joining queue...");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [lobbyState, setLobbyState] = useState<{ players: any[]; maxPlayers: number } | null>(null);
  const [phase, setPhase] = useState<"searching" | "lobby" | "ready">("searching");
  const [botFillHint, setBotFillHint] = useState(false);
  const matchedRef = useRef(false);
  const lobbyIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    let pollMatched: ReturnType<typeof setInterval> | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let redirectTimer: ReturnType<typeof setTimeout> | null = null;
    let navigatedRef = false;
    matchedRef.current = false;
    lobbyIdRef.current = null;
    setTicketId(null);
    setLobbyId(null);
    setLobbyState(null);
    setPhase("searching");
    setBotFillHint(false);
    setStatusText(
      request.mode === "invite"
        ? "Preparing your private lobby..."
        : "Searching for your next match...",
    );
    setCountdown(request.mode === "auto" || request.mode === "invite" ? 15 : null);

    const handleResponse = (response: MatchmakingResponse | any) => {
      if (cancelled) return;
      if (response.status === "MATCHED" || response.ticket?.status === "MATCHED") {
        matchedRef.current = true;
        onMatched(request, response);
        return;
      }

      const nextLobbyId = response.ticket?.lobbyId || response.lobbyId || null;
      const nextPlayers = response.lobbyState?.players || response.players || [];
      const nextMaxPlayers = response.lobbyState?.maxPlayers || response.maxPlayers || request.targetPlayers || 2;

      setTicketId(response.ticket?.id || null);
      setLobbyId(nextLobbyId);
      lobbyIdRef.current = nextLobbyId;
      setLobbyState({ players: nextPlayers, maxPlayers: nextMaxPlayers });
      setPhase(nextLobbyId || nextPlayers.length > 0 ? "lobby" : "searching");
      setStatusText(
        request.mode === "invite"
          ? nextLobbyId
            ? "Your private lobby is ready — the next step is just a moment away."
            : "Preparing your private lobby..."
          : nextPlayers.length > 0
            ? "A few players are lined up — waiting for the next move."
            : "Searching for a worthy opponent...",
      );

      if (!navigatedRef && request.mode === "invite" && nextLobbyId && onLobbyReady) {
        navigatedRef = true;
        setStatusText("Opening your private lobby...");
        redirectTimer = setTimeout(() => {
          if (!cancelled && !matchedRef.current) {
            onLobbyReady(request, response);
          }
        }, 900);
      }
    };

    gamesService
      .joinMatchmaking({
        gameId: request.game.id,
        mode: modeToApi(request.mode),
        tournamentId: request.tournamentId,
        targetPlayers: request.targetPlayers,
      })
      .then((res) => {
        if (cancelled) {
          const id = res.data.ticket?.id;
          if (id && res.data.ticket?.status === "WAITING") {
            gamesService.cancelMatchmakingTicket().catch(() => {});
          }
          return;
        }
        handleResponse(res.data);
        const id = res.data.ticket?.id;
        if (!id || res.data.status === "MATCHED") return;

        const onSocketMatched = (data: any) => {
          if (data.ticket?.id === id || data.opponent?.userId || data.players) {
            handleResponse(data);
          }
        };

        const onSocketLobbyUpdated = (data: any) => {
          if (!data) return;
          const incomingLobbyId = data.ticket?.lobbyId || data.lobbyId || data.lobby?.id;
          if (incomingLobbyId && incomingLobbyId === lobbyIdRef.current) {
            handleResponse(data);
          } else if (!lobbyIdRef.current && (data.players || data.lobbyState)) {
            handleResponse(data);
          }
        };

        socketClient.events.on("matchmaking:matched", onSocketMatched);
        socketClient.events.on("matchmaking:lobbyUpdated", onSocketLobbyUpdated);

        pollMatched = {
          cancel: () => {
            socketClient.events.off("matchmaking:matched", onSocketMatched);
            socketClient.events.off("matchmaking:lobbyUpdated", onSocketLobbyUpdated);
          },
        } as any;

        if (request.mode === "auto" || request.mode === "invite") {
          const expiresAt = res.data.expiresAt
            ? new Date(res.data.expiresAt).getTime()
            : Date.now() + 15000;

          fallbackTimer = setInterval(() => {
            if (cancelled || matchedRef.current) return;
            const now = Date.now();
            const timeRemaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));
            setCountdown(timeRemaining);

            if (timeRemaining <= 0) {
              if (fallbackTimer) clearInterval(fallbackTimer);
              if (request.mode === "auto") {
                setBotFillHint(true);
                setStatusText("Bots are joining this match...");
                if (lobbyIdRef.current) {
                  apiClient.post(`/game/lobbies/${lobbyIdRef.current}/fill-bots`).catch(() => {});
                } else if (onTimeoutFallback) {
                  onTimeoutFallback(request);
                }
              } else if (lobbyIdRef.current) {
                apiClient.post(`/game/lobbies/${lobbyIdRef.current}/fill-bots`).catch(() => {});
              }
            }
          }, 1000);
        }
      })
      .catch((error: any) => {
        setStatusText(error.response?.data?.message || "Could not join matchmaking.");
      });

    return () => {
      cancelled = true;
      if (redirectTimer) clearTimeout(redirectTimer);
      if (pollMatched) (pollMatched as any).cancel();
      if (fallbackTimer) clearInterval(fallbackTimer);
    };
  }, [request, onMatched, onLobbyReady, onTimeoutFallback]);

  const closeQueue = async () => {
    setClosing(true);
    try {
      if (ticketId && !matchedRef.current) {
        await gamesService.cancelMatchmakingTicket();
      }
    } catch (error) {
      console.warn("Failed to cancel matchmaking ticket", error);
    } finally {
      setClosing(false);
      onClose();
    }
  };

  const fillLobby = async () => {
    if (!lobbyId) return;
    setClosing(true);
    try {
      await apiClient.post(`/game/lobbies/${lobbyId}/fill-bots`, { count: 1 });
      setStatusText("A bot is joining the lobby...");
    } catch (e) {
      console.warn("Failed to fill bots", e);
      setClosing(false);
    } finally {
      setClosing(false);
    }
  };

  const renderPlayers = () => {
    const maxPlayers = lobbyState?.maxPlayers || 2;
    const players = (lobbyState?.players || []).length > 0
      ? lobbyState?.players || []
      : [{ id: user?.id || "me", name: user?.username || user?.name || "You", avatar: user?.avatarUrl || user?.avatar }];
    const previewPlayers = players.slice(0, maxPlayers);
    const emptySlots = Math.max(0, maxPlayers - previewPlayers.length);

    return (
      <View style={styles.queuePlayersWrap}>
        {previewPlayers.map((player: any) => (
          <View key={player.id || `${player.name}-${Math.random()}`} style={styles.queuePlayerCard}>
            {player.avatar ? (
              <ImageBackground source={{ uri: player.avatar }} style={styles.queueAvatar} resizeMode="cover" />
            ) : (
              <View style={styles.queueAvatarPlaceholder}>
                <Text style={styles.queueAvatarInitial}>{(player.name || player.username || "?")[0].toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.queuePlayerName} numberOfLines={1}>
              {player.name || player.username || "Player"}
            </Text>
          </View>
        ))}
        {Array.from({ length: emptySlots }).map((_, index) => (
          <View key={`empty-${index}`} style={[styles.queuePlayerCard, styles.queueEmptyCard]}>
            <View style={styles.queueAvatarPlaceholder}>
              <Ionicons name="person-outline" size={16} color={colors.text.muted} />
            </View>
            <Text style={styles.queueEmptyText}>Waiting</Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <Modal
      visible={Boolean(request)}
      transparent
      animationType="fade"
      onRequestClose={closeQueue}
    >
      <View style={styles.queueBackdrop}>
        <View style={styles.queuePanel}>
          <LinearGradient
            colors={[colors.primary, colors.cyanDark]}
            style={styles.queueGlow}
          />
          <View style={styles.queueHeader}>
            <View style={styles.queueBadge}>
              <Text style={styles.queueBadgeText}>
                {request?.mode === "invite" ? "PRIVATE LOBBY" : request?.mode === "tournament" ? "TOURNAMENT" : "PUBLIC MATCH"}
              </Text>
            </View>
            <Text style={styles.queueTitle}>
              {request?.mode === "invite"
                ? "Your lobby is ready"
                : request?.mode === "tournament"
                  ? "Tournament queue"
                  : "Finding your next match"}
            </Text>
            <Text style={styles.queueSubtitle}>{request?.game.name}</Text>
            <Text style={styles.queueStatus}>{statusText}</Text>
            {countdown !== null && !matchedRef.current && (
              <View style={styles.queueTimerPill}>
                <Ionicons name="time-outline" size={14} color={colors.primaryLight} />
                <Text style={styles.queueTimerText}>Starts in {countdown}s</Text>
              </View>
            )}
          </View>

          <View style={styles.queueStatusBox}>
            <Text style={styles.queueStatusLabel}>{phase === "lobby" ? "Lobby state" : "Searching"}</Text>
            <Text style={styles.queueStatusValue}>
              {phase === "lobby"
                ? request?.mode === "invite"
                  ? "Friends can join right away"
                  : "Players are lining up"
                : "We are matching you with a live opponent"}
            </Text>
          </View>

          {renderPlayers()}

          {request?.mode === "invite" && lobbyState && lobbyState.players.length < lobbyState.maxPlayers && ticketId && !closing && (
            <TouchableOpacity
              style={[styles.queueActionButton, styles.queuePrimaryButton]}
              onPress={fillLobby}
            >
              <Ionicons name="add-circle-outline" size={16} color="#fff" />
              <Text style={styles.queueActionText}>Fill with bots</Text>
            </TouchableOpacity>
          )}

          {request?.mode === "auto" && botFillHint && (
            <View style={[styles.queueActionButton, styles.queueSecondaryButton]}>
              <Ionicons name="sparkles-outline" size={16} color={colors.primaryLight} />
              <Text style={styles.queueActionTextSecondary}>Bots are joining now</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.queueActionButton, styles.queueSecondaryButton]}
            onPress={closeQueue}
            disabled={closing}
          >
            <Text style={styles.queueActionTextSecondary}>
              {closing ? "Cancelling..." : "Cancel"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function GamePlayModal({
  session,
  onClose,
}: {
  session: ActiveSession;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { addMatch } = useGames();
  const { user } = useAuth();
  const [phase, setPhase] = useState<"countdown" | "playing" | "result">(
    "countdown",
  );
  const [countdown, setCountdown] = useState(3);
  const [score, setScore] = useState(0);
  const [result, setResult] = useState<"win" | "loss" | "pending">("pending");
  const [xpEarned, setXpEarned] = useState(0);
  const resultAnim = useRef(new Animated.Value(0)).current;

  const [opponentPausedCountdown, setOpponentPausedCountdown] = useState<number | null>(null);

  useEffect(() => {
    const { DeviceEventEmitter } = require('react-native');
    
    const onPause = (event: any) => {
      if (event.matchId === session.matchId && event.data?.reconnectWindowMs) {
        setOpponentPausedCountdown(Math.floor(event.data.reconnectWindowMs / 1000));
      }
    };
    
    const onResume = (event: any) => {
      if (event.matchId === session.matchId) {
        setOpponentPausedCountdown(null);
      }
    };

    const sub1 = DeviceEventEmitter.addListener('GAME_ENGINE_PAUSE', onPause);
    const sub2 = DeviceEventEmitter.addListener('GAME_ENGINE_RESUME', onResume);
    const sub3 = DeviceEventEmitter.addListener('GAME_ENGINE_OVER', onResume);

    return () => {
      sub1.remove();
      sub2.remove();
      sub3.remove();
    };
  }, [session.matchId]);

  useEffect(() => {
    if (opponentPausedCountdown === null || opponentPausedCountdown <= 0) return;
    const timer = setInterval(() => {
      setOpponentPausedCountdown(prev => (prev && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [opponentPausedCountdown]);

  useEffect(() => {
    setPhase("countdown");
    setCountdown(3);
    setScore(0);
    setXpEarned(0);
    resultAnim.setValue(0);
  }, [session.matchId]);

  useEffect(() => {
    const subscription = require("react-native").DeviceEventEmitter.addListener(
      "MATCH_RESOLVED",
      (data: any) => {
        if (phase === "result" && result === "pending") {
          setResult(data.payload.result === "WIN" ? "win" : "loss");
          setXpEarned(data.payload.xpEarned || 0);

          // Jiggle animation to draw attention
          Animated.sequence([
            Animated.timing(resultAnim, {
              toValue: 1.05,
              duration: 150,
              useNativeDriver: true,
            }),
            Animated.spring(resultAnim, {
              toValue: 1,
              friction: 3,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
    );

    return () => subscription.remove();
  }, [phase, result, resultAnim]);

  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown === 0) {
      setPhase("playing");
      return;
    }
    const timer = setTimeout(() => setCountdown((value) => value - 1), 900);
    return () => clearTimeout(timer);
  }, [phase, countdown]);

  const handleComplete = async (gameResult: HtmlGameResult) => {
    try {
      let match;
      // Use the unified secure session completion for all matches
      const res = await gamesService.completeGameSession({
        sessionId: session.sessionId,
        tapLog: [],
      });
      match = res.data;

      setScore(match.score || gameResult.score);
      setResult(
        match.result === "WIN"
          ? "win"
          : match.result === "PENDING"
            ? "pending"
            : "loss",
      );
      setXpEarned(match.xpEarned || 0);
      setPhase("result");
      if (!session.wsToken) await addMatch(match);
      Animated.spring(resultAnim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 8,
      }).start();
    } catch (error: any) {
      Alert.alert(
        "Game Error",
        error.response?.data?.message || "Could not save your game result.",
      );
      onClose();
    }
  };

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
            <Text style={styles.playTitle}>{session.game.name}</Text>
            <Text style={styles.playSubtitle}>
              {session.mode?.toLowerCase() === "bot"
                ? `${user?.username || user?.name || "You"} vs AI Bot`
                : `${user?.username || user?.name || "You"} vs ${session.players?.[0]?.name || "Opponent"}`}
            </Text>
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

        {phase === "countdown" && (
          <View style={styles.countdownScreen}>
            <Text style={styles.countdownGlyph}>{session.game.emoji}</Text>
            <Text style={styles.countdownNumber}>
              {countdown === 0 ? "GO" : countdown}
            </Text>
            <Text style={styles.countdownText}>Match session is ready</Text>
          </View>
        )}

        {phase === "playing" &&
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

            if ((session.game as any).metadata?.runtime === "native") {
              const NativeGame = GAME_COMPONENTS[slug];
              if (NativeGame && token) {
                return (
                  <NativeGame
                    key={mid}
                    matchId={mid}
                    userId={uid}
                    wsToken={token}
                    myName={user?.username || user?.name || 'You'}
                    myAvatar={user?.avatarUrl || user?.avatar || null}
                    opponentName={session.players?.[0]?.name || (session.mode === 'bot' ? 'Bot' : 'Opponent')}
                    onComplete={handleComplete}
                  />
                );
              }
            }

            return null;
          })()}

        {opponentPausedCountdown !== null && phase === "playing" && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', zIndex: 100 }]}>
            <Ionicons name="warning" size={64} color={colors.warning} />
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold', marginTop: 16 }}>
              Opponent Disconnected
            </Text>
            <Text style={{ color: colors.text.secondary, fontSize: 16, textAlign: 'center', marginHorizontal: 32, marginTop: 12 }}>
              Waiting for opponent to return...
            </Text>
            <Text style={{ color: colors.primaryLight, fontSize: 36, fontWeight: '900', marginTop: 16 }}>
              {opponentPausedCountdown}s
            </Text>
            <TouchableOpacity 
               style={{ marginTop: 40, backgroundColor: colors.danger, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 24 }}
               onPress={onClose}
            >
               <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Exit Match</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === "result" && (
          <View style={styles.resultScreen}>
            <Animated.View
              style={[
                styles.resultPanel,
                {
                  transform: [
                    {
                      scale: resultAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.94, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text
                style={[
                  styles.resultTitle,
                  {
                    color:
                      result === "win"
                        ? colors.success
                        : result === "pending"
                          ? colors.primaryLight
                          : colors.danger,
                  },
                ]}
              >
                {result === "win"
                  ? "Win Recorded"
                  : result === "pending"
                    ? "Waiting for Opponent..."
                    : "Match Recorded"}
              </Text>
              <Text style={styles.resultSubtitle}>
                {result === "pending"
                  ? "Your score is saved. XP will be awarded when your opponent finishes."
                  : "Your score is saved and your ranking is updated."}
              </Text>
              <View style={styles.resultStats}>
                <InfoPill label="Score" value={String(score)} />
                <InfoPill label="XP" value={`+${xpEarned}`} />
              </View>
              <TouchableOpacity onPress={onClose} activeOpacity={0.85}>
                <LinearGradient
                  colors={[colors.primary, colors.cyanDark]}
                  style={styles.doneButton}
                >
                  <Text style={styles.primaryButtonText}>Done</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}
      </View>
    </Modal>
  );
}

function MatchRow({ match }: { match: GameMatch }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isWin = match.result === "win";
  return (
    <View style={styles.matchRow}>
      <View style={styles.matchIcon}>
        <Text style={styles.matchGlyph}>{match.gameEmoji}</Text>
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
            <EmptyBlock
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

function LoadingBlock({ label }: { label: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.emptyBlock}>
      <ActivityIndicator color={colors.primaryLight} />
      <Text style={styles.emptyTitle}>{label}</Text>
    </View>
  );
}

function EmptyBlock({ title, subtitle }: { title: string; subtitle: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.emptyBlock}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg.base },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
    },
    title: {
      fontSize: fontSizes.xxl,
      fontWeight: "800",
      color: c.text.primary,
    },
    subtitle: {
      maxWidth: 280,
      marginTop: 2,
      fontSize: fontSizes.sm,
      color: c.text.muted,
    },
    iconButton: {
      width: 38,
      height: 38,
      borderRadius: radii.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.bg.card,
      borderWidth: 1,
      borderColor: c.border,
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
    tabRow: {
      flexDirection: "row",
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      padding: 3,
      backgroundColor: c.bg.card,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    tab: {
      flex: 1,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radii.sm,
    },
    tabActive: { backgroundColor: c.primary },
    tabText: { fontSize: fontSizes.xs, color: c.text.muted, fontWeight: "700" },
    tabTextActive: { color: "#fff" },
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
    gameGlyph: { fontSize: 44, fontWeight: "900", color: "#fff" },
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
    tournamentGlyph: {
      fontSize: fontSizes.xl,
      fontWeight: "900",
      color: "#fff",
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
    tournamentButtonText: {
      color: "#fff",
      fontSize: fontSizes.sm,
      fontWeight: "800",
    },
    queueBackdrop: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.lg,
      backgroundColor: "rgba(2,6,23,0.8)",
    },
    queuePanel: {
      position: "relative",
      width: "100%",
      padding: spacing.xl,
      borderRadius: radii.xl,
      alignItems: "center",
      backgroundColor: c.bg.card,
      borderWidth: 1,
      borderColor: c.border,
      overflow: "hidden",
    },
    queueGlow: {
      position: "absolute",
      top: -40,
      width: 220,
      height: 220,
      borderRadius: 110,
      opacity: 0.18,
    },
    queueHeader: {
      alignItems: "center",
    },
    queueBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radii.full,
      backgroundColor: "rgba(255,255,255,0.1)",
      marginBottom: spacing.sm,
    },
    queueBadgeText: {
      color: c.primaryLight,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1,
    },
    queueTitle: {
      color: c.text.primary,
      fontSize: fontSizes.lg,
      fontWeight: "900",
      textAlign: "center",
    },
    queueSubtitle: {
      marginTop: 2,
      color: c.primaryLight,
      fontSize: fontSizes.sm,
      fontWeight: "800",
      textAlign: "center",
    },
    queueStatus: {
      marginTop: spacing.sm,
      textAlign: "center",
      color: c.text.muted,
      fontSize: fontSizes.sm,
      lineHeight: 20,
    },
    queueTimerPill: {
      marginTop: spacing.sm,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: "rgba(56,189,248,0.12)",
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radii.full,
    },
    queueTimerText: {
      color: c.primaryLight,
      fontSize: 12,
      fontWeight: "700",
    },
    queueStatusBox: {
      width: "100%",
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: c.bg.elevated,
      borderWidth: 1,
      borderColor: c.border,
    },
    queueStatusLabel: {
      color: c.text.secondary,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    queueStatusValue: {
      marginTop: 4,
      color: c.text.primary,
      fontSize: fontSizes.sm,
      fontWeight: "700",
    },
    queuePlayersWrap: {
      width: "100%",
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      marginTop: spacing.md,
      gap: spacing.sm,
    },
    queuePlayerCard: {
      width: "48%",
      padding: spacing.sm,
      alignItems: "center",
      borderRadius: radii.md,
      backgroundColor: c.bg.elevated,
      borderWidth: 1,
      borderColor: c.border,
    },
    queueEmptyCard: {
      opacity: 0.7,
    },
    queueAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      marginBottom: 6,
    },
    queueAvatarPlaceholder: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.bg.card,
      marginBottom: 6,
      borderWidth: 1,
      borderColor: c.border,
    },
    queueAvatarInitial: {
      color: c.text.primary,
      fontSize: fontSizes.md,
      fontWeight: "800",
    },
    queuePlayerName: {
      color: c.text.primary,
      fontSize: fontSizes.xs,
      fontWeight: "700",
      textAlign: "center",
    },
    queueEmptyText: {
      color: c.text.muted,
      fontSize: 11,
      fontWeight: "700",
    },
    queueActionButton: {
      width: "100%",
      marginTop: spacing.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
      borderRadius: radii.md,
    },
    queuePrimaryButton: {
      backgroundColor: c.primary,
    },
    queueSecondaryButton: {
      backgroundColor: c.bg.elevated,
      borderWidth: 1,
      borderColor: c.border,
    },
    queueActionText: {
      color: "#fff",
      fontWeight: "800",
      fontSize: fontSizes.sm,
    },
    queueActionTextSecondary: {
      color: c.text.primary,
      fontWeight: "800",
      fontSize: fontSizes.sm,
    },
    playModal: { flex: 1, backgroundColor: "#05050F" },
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
    playTitle: { color: "#fff", fontSize: fontSizes.md, fontWeight: "900" },
    playSubtitle: { marginTop: 2, color: "#94A3B8", fontSize: fontSizes.xs },
    scoreBox: { width: 58, alignItems: "flex-end" },
    scoreLabel: { color: "#94A3B8", fontSize: 10, fontWeight: "700" },
    scoreValue: { color: "#fff", fontSize: fontSizes.lg, fontWeight: "900" },
    countdownScreen: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.md,
    },
    countdownGlyph: { color: "#fff", fontSize: 74, fontWeight: "900" },
    countdownNumber: { color: "#fff", fontSize: 96, fontWeight: "900" },
    countdownText: { color: "#94A3B8", fontSize: fontSizes.md },
    resultScreen: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.lg,
    },
    resultPanel: {
      width: "100%",
      padding: spacing.xl,
      borderRadius: radii.lg,
      alignItems: "center",
      backgroundColor: "rgba(15,23,42,0.96)",
      borderWidth: 1,
      borderColor: "rgba(148,163,184,0.18)",
    },
    resultTitle: { fontSize: fontSizes.h2, fontWeight: "900" },
    resultSubtitle: {
      marginTop: spacing.sm,
      color: "#94A3B8",
      textAlign: "center",
      fontSize: fontSizes.sm,
    },
    resultStats: {
      width: "100%",
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    doneButton: {
      minWidth: 170,
      height: 46,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radii.full,
      marginTop: spacing.lg,
    },
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
    matchGlyph: { color: c.text.primary, fontWeight: "900" },
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
    emptyBlock: {
      margin: spacing.lg,
      padding: spacing.xl,
      alignItems: "center",
      borderRadius: radii.lg,
      backgroundColor: c.bg.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    emptyTitle: {
      color: c.text.primary,
      fontSize: fontSizes.md,
      fontWeight: "900",
      textAlign: "center",
    },
    emptySubtitle: {
      marginTop: 6,
      color: c.text.muted,
      fontSize: fontSizes.sm,
      textAlign: "center",
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
    inviteBannerText: {
      color: "#fff",
      fontSize: fontSizes.md,
      fontWeight: "700",
      marginBottom: 12,
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
