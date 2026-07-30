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
import { useNavigation } from "@react-navigation/native";
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
import HtmlGameWebView from "../../components/games/HtmlGameWebView";
import { HTML5_GAMES } from "../../games/htmlGames";
import type { HtmlGameDefinition, HtmlGameResult } from "../../games/types";
import MatchModeModal, {
  MatchMode,
} from "../../components/games/MatchModeModal";
import { apiClient } from "../../services/apiClient";
import type { User } from "../../types";
import { useAuth } from "../../context/AuthContext";

type ActiveTab = "games" | "tournaments" | "history";
type ScreenModal = "none" | "history";
type QueueRequest = {
  game: HtmlGameDefinition;
  mode: "quick" | "tournament";
  tournamentId?: string;
};
type ActiveSession = {
  game: HtmlGameDefinition;
  mode: PlayMode;
  matchId: string;
  wsToken?: string;
  opponentName?: string;
  tournamentId?: string;
};

const MATCH_MODE_LABEL: Record<PlayMode, string> = {
  bot: "Bot Match",
  quick: "Real Match",
  tournament: "Tournament Match",
};

const modeToApi = (mode: "quick" | "tournament") =>
  mode === "quick" ? "QUICK" : "TOURNAMENT";

const findLocalGame = (gameId: string) =>
  HTML5_GAMES.find((game) => game.id === gameId || game.slug === gameId);

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
  const { matches, fetchGamesData } = useGames();

  const [activeTab, setActiveTab] = useState<ActiveTab>("games");
  const [screenModal, setScreenModal] = useState<ScreenModal>("none");
  const [tournaments, setTournaments] = useState<GameTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [queueRequest, setQueueRequest] = useState<QueueRequest | null>(null);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(
    null,
  );
  const [matchModalVisible, setMatchModalVisible] = useState(false);
  const [selectedGame, setSelectedGame] = useState<HtmlGameDefinition | null>(
    null,
  );

  const onlinePlayers = useMemo(() => {
    return 342 + new Date().getHours() * 12 + (new Date().getMinutes() % 10);
  }, []);

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
    } finally {
      setLoading(false);
    }
  }, [fetchGamesData]);

  useEffect(() => {
    loadGamesData();
  }, [loadGamesData]);

  const startBotSession = async (game: HtmlGameDefinition) => {
    setStartingId(`${game.id}:bot`);
    try {
      const res = await gamesService.startGameSession(game.id, "bot");
      setActiveSession({
        game,
        mode: "bot",
        matchId: res.data.sessionId,
        wsToken: res.data.wsToken,
        opponentName: "AI Bot",
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

  const startQueue = (request: QueueRequest) => {
    setQueueRequest(request);
  };

  const handleMatched = useCallback(
    (request: QueueRequest, response: MatchmakingResponse) => {
      if (!response.match?.id) {
        Alert.alert(
          "Matchmaking Error",
          "Matched session did not include a playable match.",
        );
        return;
      }

      setQueueRequest(null);

      // Convert game_match into secure game_session
      const matchGroupId = response.match.metadata?.matchGroupId;

      gamesService
        .startGameSession(request.game.id, request.mode, matchGroupId)
        .then((res) => {
          setActiveSession({
            game: request.game,
            mode: request.mode,
            matchId: res.data.sessionId,
            wsToken: res.data.wsToken,
            opponentName:
              response.opponent?.name ||
              response.opponent?.username ||
              response.ticket?.opponentName ||
              "Matched Player",
            tournamentId: request.tournamentId,
          });
        })
        .catch((e) => {
          Alert.alert("Error", "Failed to initialize secure game session.");
        });
    },
    [],
  );

  const handleSessionClose = () => {
    setActiveSession(null);
    loadGamesData();
  };

  const handleModeSelect = async (mode: MatchMode, opponents?: User[]) => {
    setMatchModalVisible(false);
    if (!selectedGame) return;

    if (mode === "bot") {
      startBotSession(selectedGame);
    } else if (mode === "auto") {
      startQueue({ game: selectedGame, mode: "quick" });
    } else if (mode === "manual" && opponents && opponents.length > 0) {
      try {
        // 1. Start the queue/bot session or a private match.
        // For now we will do quick match or bot match as fallback since private match is not fully defined on backend.
        // But we will definitely send push notifications to invitees.

        // Let's create a match group ID for the invites
        const matchGroupId = `group-${Date.now()}`;

        // 2. Send push notifications to opponents
        for (const opp of opponents) {
          await apiClient
            .post("/push/send", {
              userId: opp.id,
              title: "Game Invite! 🎮",
              message: `${user?.name || "A friend"} invited you to play ${selectedGame.name}!`,
              data: { gameId: selectedGame.id, matchGroupId },
            })
            .catch(console.error);
        }

        Alert.alert(
          "Invites Sent!",
          "Your friends have been notified. Waiting for them to join...",
        );
        // Here we could join matchmaking with a specific matchGroupId
        // For now, we'll start queue in tournament/quick mode so they can theoretically match.
        startQueue({ game: selectedGame, mode: "quick" });
      } catch (e) {
        console.error(e);
        Alert.alert("Error", "Failed to send invites.");
      }
    }
  };

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
            <SectionHeader title="Bundled Games" />
            <View style={styles.gameGrid}>
              {HTML5_GAMES.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  startingId={startingId}
                  onPlayClick={() => {
                    setSelectedGame(game);
                    setMatchModalVisible(true);
                  }}
                />
              ))}
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
                  <TournamentCard
                    key={tournament.id}
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

      <QueueModal
        request={queueRequest}
        onClose={() => setQueueRequest(null)}
        onMatched={handleMatched}
        onTimeoutFallback={(req) => {
          setQueueRequest(null);
          Alert.alert(
            "No Opponent Found",
            "No players are currently available. You have been placed in a match against an AI bot.",
          );
          startBotSession(req.game);
        }}
      />

      <MatchModeModal
        visible={matchModalVisible}
        game={selectedGame}
        onClose={() => setMatchModalVisible(false)}
        onSelectMode={handleModeSelect}
      />

      {activeSession && (
        <GamePlayModal session={activeSession} onClose={handleSessionClose} />
      )}

      <HistoryModal
        visible={screenModal === "history"}
        matches={matches}
        onClose={() => setScreenModal("none")}
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
  onPlayClick,
}: {
  game: HtmlGameDefinition;
  startingId: string | null;
  onPlayClick: () => void;
}) {
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
          {game.isHot && <Text style={styles.gameBadge}>HOT</Text>}
        </ImageBackground>
      ) : (
        <LinearGradient
          colors={game.gradient as [string, string]}
          style={styles.gameArt}
        >
          <Text style={styles.gameGlyph}>{game.emoji}</Text>
          {game.isHot && <Text style={styles.gameBadge}>HOT</Text>}
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
            colors={[colors.primary, colors.cyanDark]}
            style={styles.primaryButton}
          >
            {isStarting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="play" size={16} color="#fff" />
            )}
            <Text style={styles.primaryButtonText}>
              PLAY | {game.entryFee || 0} XP
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
  game: HtmlGameDefinition;
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
  onTimeoutFallback,
}: {
  request: QueueRequest | null;
  onClose: () => void;
  onMatched: (request: QueueRequest, response: MatchmakingResponse) => void;
  onTimeoutFallback?: (request: QueueRequest) => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("Joining queue...");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const matchedRef = useRef(false);

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    matchedRef.current = false;
    setTicketId(null);
    setStatusText("Joining queue...");
    setCountdown(request.mode === "quick" ? 10 : null);

    const handleResponse = (response: MatchmakingResponse) => {
      if (cancelled) return;
      if (
        response.status === "MATCHED" ||
        response.ticket?.status === "MATCHED"
      ) {
        matchedRef.current = true;
        if (poll) clearInterval(poll);
        onMatched(request, response);
        return;
      }
      setTicketId(response.ticket?.id || null);
      setStatusText("Waiting for another real player...");
    };

    gamesService
      .joinMatchmaking({
        gameId: request.game.id,
        mode: modeToApi(request.mode),
        tournamentId: request.tournamentId,
      })
      .then((res) => {
        if (cancelled) {
          const id = res.data.ticket?.id;
          if (id && res.data.ticket?.status === "WAITING") {
            gamesService.cancelMatchmakingTicket(id).catch(() => {});
          }
          return;
        }
        handleResponse(res.data);
        const id = res.data.ticket?.id;
        if (!id || res.data.status === "MATCHED") return;
        poll = setInterval(() => {
          gamesService
            .getMatchmakingTicket(id)
            .then((ticketRes) => handleResponse(ticketRes.data))
            .catch(() =>
              setStatusText("Still waiting. Pulling latest queue status..."),
            );
        }, 2500);

        if (request.mode === "quick" && onTimeoutFallback) {
          let timeRemaining = 10;
          fallbackTimer = setInterval(() => {
            if (cancelled || matchedRef.current) return;
            timeRemaining--;
            setCountdown(timeRemaining);
            if (timeRemaining <= 0) {
              if (fallbackTimer) clearInterval(fallbackTimer);
              if (poll) clearInterval(poll);
              cancelled = true;
              gamesService.cancelMatchmakingTicket(id).catch(() => {});
              onTimeoutFallback(request);
            }
          }, 1000);
        }
      })
      .catch((error: any) => {
        setStatusText(
          error.response?.data?.message || "Could not join matchmaking.",
        );
      });

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      if (fallbackTimer) clearInterval(fallbackTimer);
    };
  }, [request, onMatched, onTimeoutFallback]);

  const closeQueue = async () => {
    setClosing(true);
    try {
      if (ticketId && !matchedRef.current) {
        await gamesService.cancelMatchmakingTicket(ticketId);
      }
    } catch (error) {
      console.warn("Failed to cancel matchmaking ticket", error);
    } finally {
      setClosing(false);
      onClose();
    }
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
          <View style={styles.queueHeader}>
            <ActivityIndicator
              size="large"
              color={colors.primaryLight}
              style={{ marginBottom: 16 }}
            />
            {countdown !== null && !matchedRef.current && (
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: "800",
                  color: colors.primaryLight,
                  marginVertical: 8,
                }}
              >
                {countdown}s
              </Text>
            )}
            <Text style={styles.queueStatus}>{statusText}</Text>
          </View>
          <Text style={styles.queueTitle}>
            {request?.mode === "tournament"
              ? "Tournament Queue"
              : "Real Matchmaking"}
          </Text>
          <Text style={styles.queueSubtitle}>{request?.game.name}</Text>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={closeQueue}
            disabled={closing}
          >
            <Text style={styles.cancelButtonText}>
              {closing ? "Cancelling..." : "Cancel Queue"}
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
  const [phase, setPhase] = useState<"countdown" | "playing" | "result">(
    "countdown",
  );
  const [countdown, setCountdown] = useState(3);
  const [score, setScore] = useState(0);
  const [result, setResult] = useState<"win" | "loss" | "pending">("win");
  const [xpEarned, setXpEarned] = useState(0);
  const resultAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setPhase("countdown");
    setCountdown(3);
    setScore(0);
    setXpEarned(0);
    resultAnim.setValue(0);

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
  }, [session.matchId, phase, result]);

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
      if (session.wsToken) {
        const res = await gamesService.completeGameSession({
          sessionId: session.matchId,
          tapLog: [],
        });
        match = res.data;
      } else {
        const res = await gamesService.completeMatch({
          matchId: session.matchId,
          result: gameResult.won ? "WIN" : "LOSS",
          score: gameResult.score,
          duration: gameResult.durationSeconds,
          xpEarned: gameResult.xpEarned,
        });
        match = res.data;
      }

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
              {MATCH_MODE_LABEL[session.mode]} vs{" "}
              {session.opponentName || "Matched Player"}
            </Text>
          </View>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>Score</Text>
            <Text style={styles.scoreValue}>{score}</Text>
          </View>
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

        {phase === "playing" && (
          <HtmlGameWebView
            key={session.matchId}
            game={session.game}
            sessionId={session.matchId}
            wsToken={session.wsToken}
            mode={session.mode}
            onScore={setScore}
            onComplete={handleComplete}
          />
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
      backgroundColor: "rgba(0,0,0,0.68)",
    },
    queuePanel: {
      width: "100%",
      padding: spacing.xl,
      borderRadius: radii.lg,
      alignItems: "center",
      backgroundColor: c.bg.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    queueTitle: {
      marginTop: spacing.md,
      color: c.text.primary,
      fontSize: fontSizes.lg,
      fontWeight: "900",
    },
    queueSubtitle: {
      marginTop: 2,
      color: c.primaryLight,
      fontSize: fontSizes.sm,
      fontWeight: "800",
    },
    queueStatus: {
      marginTop: spacing.md,
      textAlign: "center",
      color: c.text.muted,
      fontSize: fontSizes.sm,
    },
    cancelButton: {
      marginTop: spacing.lg,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: radii.full,
      backgroundColor: c.bg.elevated,
    },
    cancelButtonText: { color: c.text.secondary, fontWeight: "800" },
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
  });
}
