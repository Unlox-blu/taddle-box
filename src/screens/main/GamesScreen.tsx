const LEADERBOARD: any[] = [];
const GAMES: any[] = [];
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Dimensions, Modal, Animated, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
// removed mockData import
import { useGames, type PlayMode, type GameMatch } from '../../context/GamesContext';
import { useWallet } from '../../context/WalletContext';
import { useThemeColors } from '../../context/ThemeContext';
import { xpService } from '../../services/xp.service';
import MainHeader from '../../components/common/MainHeader';
import type { Game } from '../../types';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = (SCREEN_W - spacing.lg * 2 - 12) / 2;

// ─── Constants ────────────────────────────────────────────────────────────────

function getRankColors(c: ColorPalette): string[] {
  return ['#FBBF24', '#94A3B8', '#CD7C2F', c.text.muted, c.text.muted];
}

function getModeMeta(c: ColorPalette): Record<PlayMode, { icon: string; label: string; sub: string; color: string }> {
  return {
    bot:        { icon: '🤖', label: 'vs Bot',      sub: 'Practice · No entry fee',  color: c.success      },
    quick:      { icon: '⚡', label: 'Quick Match',  sub: 'vs Random Player · Free',  color: c.primaryLight },
    tournament: { icon: '🏆', label: 'Tournament',   sub: 'Entry: 50 XP · Win big',   color: c.xpGold       },
  };
}

const TOURNAMENTS = [
  { id: 't1', name: 'Weekly Chess Championship', game: 'Chess', emoji: '♟️', prize: '₹10,000', xpPrize: 500, players: 328, maxPlayers: 512, endsIn: '2d 14h', entryFee: 50, isRegistered: false, progress: 0.64 },
  { id: 't2', name: 'Ludo Grand Prix',           game: 'Ludo',  emoji: '🎲', prize: '₹5,000',  xpPrize: 300, players: 196, maxPlayers: 256, endsIn: '4d 6h',  entryFee: 30, isRegistered: true,  progress: 0.77 },
  { id: 't3', name: 'Block Blaster Cup',         game: 'Block Blaster', emoji: '💥', prize: '₹2,000', xpPrize: 150, players: 88,  maxPlayers: 128, endsIn: '1d 2h',  entryFee: 20, isRegistered: false, progress: 0.69 },
];

// Pre-scripted chess move log
const CHESS_MOVES = [
  { player: true,  text: '♙ e2 → e4',   sub: 'King\'s Pawn Opening' },
  { player: false, text: '♟ e7 → e5',   sub: 'Symmetrical response' },
  { player: true,  text: '♘ g1 → f3',   sub: 'Knight to f3'         },
  { player: false, text: '♞ b8 → c6',   sub: 'Knight development'   },
  { player: true,  text: '♗ f1 → c4',   sub: 'Italian Game!'        },
  { player: false, text: '♝ f8 → c5',   sub: 'Mirror strategy'      },
  { player: true,  text: '♕ d1 → h5',   sub: 'Fried Liver Attack!'  },
];

// Chess board initial position (8×8, mid-game)
const CHESS_BOARD: string[][] = [
  ['♜','♞','♝','♛','♚','♝',' ','♜'],
  ['♟','♟','♟',' ','♟','♟','♟','♟'],
  [' ',' ',' ','♟',' ','♞',' ',' '],
  [' ',' ',' ',' ','♙',' ',' ',' '],
  ['♙','♙',' ','♙',' ','♙',' ',' '],
  [' ',' ',' ',' ',' ','♘',' ','♙'],
  [' ',' ','♙',' ',' ','♙','♙',' '],
  ['♖',' ','♗','♕','♔','♗',' ','♖'],
];

// Highlight pairs per move [fromRow, fromCol, toRow, toCol]
const CHESS_HIGHLIGHTS: [number,number,number,number][] = [
  [6,4,4,4], [1,4,3,4], [7,6,5,5], [2,5,3,5],
  [7,3,4,6], [1,3,2,3], [4,6,1,6],
];

// Ludo token positions (4 players, each with 1 token index 0-27 on path)
const LUDO_COLORS = ['#EF4444','#3B82F6','#10B981','#FBBF24'];

// Block grid colors
const BLOCK_COLORS = ['#EF4444','#3B82F6','#10B981','#FBBF24','#8B5CF6'];
const CANDY_EMOJIS = ['🍎','🍊','🍋','🍇','🍓'];

// ─── Main Screen ──────────────────────────────────────────────────────────────

type ActiveTab = 'all' | 'tournaments' | 'history';
type ScreenModal = 'none' | 'history' | 'leaderboard';

export default function GamesScreen() {
  const insets = useSafeAreaInsets();
  const { stats, matches } = useGames();
  const {} = useWallet();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const RANK_COLORS = useMemo(() => getRankColors(colors), [colors]);
  const MODE_META   = useMemo(() => getModeMeta(colors), [colors]);

  const [activeTab,    setActiveTab]    = useState<ActiveTab>('all');
  const [screenModal,  setScreenModal]  = useState<ScreenModal>('none');
  const [playingGame,  setPlayingGame]  = useState<Game | null>(null);
  const [playingMode,  setPlayingMode]  = useState<PlayMode>('bot');
  const [showLobby,    setShowLobby]    = useState(false);
  const [registeredT,  setRegisteredT]  = useState<string[]>(['t2']);

  const winRate = stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0;

  const openLobby = (game: Game, mode?: PlayMode) => {
    setPlayingGame(game);
    setPlayingMode(mode ?? 'bot');
    setShowLobby(true);
  };

  const handleRegisterTournament = (tid: string, entryFee: number) => {
    Alert.alert(
      'Join Tournament',
      `Entry fee: ${entryFee} XP\nThis will be deducted from your XP balance.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Join', onPress: () => setRegisteredT(prev => [...prev, tid]) },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      <MainHeader />

      {/* ── Header ── */}
      <LinearGradient colors={['rgba(124,58,237,0.18)', 'transparent']} style={styles.headerGrad}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Game Zone 🎮</Text>
            <Text style={styles.subtitle}>Play, compete & earn XP rewards</Text>
          </View>
          <TouchableOpacity style={styles.historyBtn} onPress={() => setScreenModal('history')}>
            <Ionicons name="time-outline" size={20} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>

        {/* Player stats */}
        <View style={styles.statsRow}>
          {[
            { label: 'XP Earned',    value: stats.totalXP.toLocaleString(), color: colors.xpGold      },
            { label: 'Games Played', value: String(stats.gamesPlayed),       color: colors.primaryLight },
            { label: 'Win Rate',     value: `${winRate}%`,                   color: colors.cyanLight    },
            { label: 'Win Streak',   value: `🔥${stats.currentStreak}`,      color: colors.success      },
          ].map(s => (
            <View key={s.label} style={styles.statCard}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* ── Tabs ── */}
      <View style={styles.tabRow}>
        {(['all', 'tournaments', 'history'] as ActiveTab[]).map(t => (
          <TouchableOpacity
            key={t}
            onPress={() => setActiveTab(t)}
            style={[styles.tab, activeTab === t && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
              {t === 'all' ? '🎮 All Games' : t === 'tournaments' ? '🏆 Tournaments' : '📜 History'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ═══ TAB: ALL ═══ */}
        {activeTab === 'all' && (
          <>
            {/* Tournament banner */}
            <TouchableOpacity
              style={styles.tournBanner}
              onPress={() => setActiveTab('tournaments')}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['rgba(124,58,237,0.22)', 'rgba(6,182,212,0.12)']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.tournBannerInner}
              >
                <LinearGradient colors={[colors.primary, colors.cyanDark]} style={styles.tournIcon}>
                  <Text style={{ fontSize: 26 }}>🏆</Text>
                </LinearGradient>
                <View style={styles.tournInfo}>
                  <Text style={styles.tournTitle}>Weekly Championship</Text>
                  <Text style={styles.tournMeta}>Ends 2d 14h · 328 players · ₹10,000 prize</Text>
                  <View style={styles.tournProgress}>
                    <View style={[styles.tournProgressFill, { width: '64%' }]} />
                  </View>
                </View>
                <View style={styles.joinBtn}>
                  <Text style={styles.joinBtnText}>View →</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            {/* Game grid */}
            <Text style={styles.sectionLabel}>Featured Games</Text>
            <View style={styles.gameGrid}>
              {GAMES.map(g => (
                <GameCard key={g.id} game={g} onPress={() => openLobby(g)} />
              ))}
            </View>

            {/* Play modes */}
            <Text style={[styles.sectionLabel, { marginTop: 4 }]}>Quick Play</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.modeRow}>
              {(Object.entries(MODE_META) as [PlayMode, typeof MODE_META[PlayMode]][]).map(([mode, meta]) => (
                <TouchableOpacity
                  key={mode}
                  style={styles.modeCard}
                  onPress={() => GAMES[0] && openLobby(GAMES[0], mode)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modeEmoji}>{meta.icon}</Text>
                  <Text style={styles.modeLabel}>{meta.label}</Text>
                  <Text style={styles.modeSub}>{meta.sub}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Leaderboard widget */}
            <Text style={styles.sectionLabel}>Top Players This Week</Text>
            <View style={styles.lbCard}>
              <LinearGradient
                colors={['rgba(124,58,237,0.18)', 'rgba(6,182,212,0.08)']}
                style={styles.lbHead}
              >
                <Text style={styles.lbTitle}>🔥 Leaderboard</Text>
                <TouchableOpacity onPress={() => setScreenModal('leaderboard')}>
                  <Text style={[styles.sectionLabel, { color: colors.text.muted, fontSize: fontSizes.xs, paddingHorizontal: 0, marginBottom: 0 }]}>TOP PLAYERS →</Text>
                </TouchableOpacity>
              </LinearGradient>
              {LEADERBOARD.slice(0, 3).filter(Boolean).map((e, i) => (
                <View key={e.rank} style={[styles.lbRow, i === 2 && { borderBottomWidth: 0 }]}>
                  <Text style={[styles.lbRank, { color: RANK_COLORS[i] }]}>{e.rank}</Text>
                  <View style={styles.lbAvatar}><Text style={{ fontSize: 16 }}>{e.avatar}</Text></View>
                  <Text style={styles.lbName}>{e.user}</Text>
                  <Text style={styles.lbXp}>⚡ {e.xp.toLocaleString()}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ═══ TAB: TOURNAMENTS ═══ */}
        {activeTab === 'tournaments' && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Active Tournaments</Text>
            {TOURNAMENTS.map(t => {
              const isReg = registeredT.includes(t.id);
              return (
                <View key={t.id} style={styles.tournCard}>
                  <LinearGradient
                    colors={['rgba(124,58,237,0.15)', 'rgba(6,182,212,0.07)']}
                    style={styles.tournCardBanner}
                  >
                    <Text style={{ fontSize: 32 }}>{t.emoji}</Text>
                    <View style={styles.tournEndsChip}>
                      <Ionicons name="time-outline" size={11} color={colors.xpGold} />
                      <Text style={styles.tournEndsText}>Ends {t.endsIn}</Text>
                    </View>
                  </LinearGradient>
                  <View style={styles.tournCardBody}>
                    <Text style={styles.tournCardName}>{t.name}</Text>
                    <Text style={styles.tournCardGame}>{t.game} · {t.players}/{t.maxPlayers} players</Text>
                    <View style={styles.tournPrizeRow}>
                      <View style={styles.tournPrizeItem}>
                        <Text style={styles.tournPrizeVal}>{t.prize}</Text>
                        <Text style={styles.tournPrizeLabel}>Cash Prize</Text>
                      </View>
                      <View style={styles.tournPrizeDivider} />
                      <View style={styles.tournPrizeItem}>
                        <Text style={[styles.tournPrizeVal, { color: colors.xpGold }]}>+{t.xpPrize} XP</Text>
                        <Text style={styles.tournPrizeLabel}>XP Reward</Text>
                      </View>
                      <View style={styles.tournPrizeDivider} />
                      <View style={styles.tournPrizeItem}>
                        <Text style={styles.tournPrizeVal}>{t.entryFee} XP</Text>
                        <Text style={styles.tournPrizeLabel}>Entry Fee</Text>
                      </View>
                    </View>
                    <View style={styles.tournProgressWrap}>
                      <Text style={styles.tournProgressLabel}>{Math.round(t.progress * 100)}% full</Text>
                      <View style={styles.tournProgressBar}>
                        <View style={[styles.tournProgressFill, { width: `${t.progress * 100}%` }]} />
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.tournJoinBtn, isReg && styles.tournJoinBtnReg]}
                      onPress={() => !isReg && handleRegisterTournament(t.id, t.entryFee)}
                      activeOpacity={0.8}
                    >
                      {isReg ? (
                        <LinearGradient colors={['rgba(16,185,129,0.2)', 'rgba(16,185,129,0.2)']} style={styles.tournJoinBtnInner}>
                          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                          <Text style={[styles.tournJoinBtnText, { color: colors.success }]}>Registered · Play Now</Text>
                        </LinearGradient>
                      ) : (
                        <LinearGradient colors={[colors.primary, colors.cyanDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tournJoinBtnInner}>
                          <Ionicons name="trophy-outline" size={16} color="#fff" />
                          <Text style={styles.tournJoinBtnText}>Join Tournament · {t.entryFee} XP</Text>
                        </LinearGradient>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ═══ TAB: HISTORY ═══ */}
        {activeTab === 'history' && (
          <>
            {/* Stats summary */}
            <View style={styles.histStatsRow}>
              {[
                { label: 'Played',     value: String(stats.gamesPlayed), icon: '🎮' },
                { label: 'Wins',       value: String(stats.wins),         icon: '🏆' },
                { label: 'Best Streak',value: String(stats.bestStreak),   icon: '🔥' },
                { label: 'Total XP',   value: `${stats.totalXP.toLocaleString()}`, icon: '⚡' },
              ].map(s => (
                <View key={s.label} style={styles.histStatCard}>
                  <Text style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</Text>
                  <Text style={styles.histStatVal}>{s.value}</Text>
                  <Text style={styles.histStatLabel}>{s.label}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Recent Matches</Text>
            {matches.map(m => <MatchRow key={m.id} match={m} />)}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Game Lobby + Play Modal ── */}
      {playingGame && (
        <GamePlayModal
          game={playingGame}
          initialMode={playingMode}
          visible={showLobby}
          onClose={() => { setShowLobby(false); setPlayingGame(null); }}
          onEarnXP={(xpAmount) => xpService.creditXP(xpAmount, 'earned', 'games').catch(() => {})}
        />
      )}

      {/* ── History Modal ── */}
      <HistoryModal
        visible={screenModal === 'history'}
        matches={matches}
        onClose={() => setScreenModal('none')}
      />

      {/* ── Leaderboard Modal ── */}
      <LeaderboardModal
        visible={screenModal === 'leaderboard'}
        onClose={() => setScreenModal('none')}
      />
    </View>
  );
}

// ─── GameCard ─────────────────────────────────────────────────────────────────

function GameCard({ game: g, onPress }: { game: Game; onPress: () => void }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity style={styles.gameCard} onPress={onPress} activeOpacity={0.8}>
      <LinearGradient colors={g.gradient as [string,string]} style={styles.gameThumb}>
        <Text style={styles.gameEmoji}>{g.emoji}</Text>
        {g.isHot && <View style={styles.hotBadge}><Text style={styles.hotText}>🔴 HOT</Text></View>}
        <View style={styles.onlineRow}>
          <View style={styles.onlineDot} />
          <Text style={styles.onlineText}>
            {g.playersOnline >= 1000 ? `${(g.playersOnline/1000).toFixed(1)}k` : g.playersOnline} online
          </Text>
        </View>
      </LinearGradient>
      <View style={styles.gameInfo}>
        <Text style={styles.gameName}>{g.name}</Text>
        <Text style={styles.gameXp}>⚡ Up to {g.maxXp} XP</Text>
        <View style={styles.gamePlayBtn}>
          <Text style={styles.gamePlayBtnText}>Play →</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── MatchRow ─────────────────────────────────────────────────────────────────

function MatchRow({ match: m }: { match: GameMatch }) {
  const isWin = m.result === 'win';
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.matchRow}>
      <View style={styles.matchGameIcon}>
        <Text style={{ fontSize: 22 }}>{m.gameEmoji}</Text>
      </View>
      <View style={styles.matchInfo}>
        <Text style={styles.matchGameName}>{m.gameName}</Text>
        <Text style={styles.matchMeta}>vs {m.opponent} · {m.duration}</Text>
        <Text style={styles.matchDate}>{m.playedAt}</Text>
      </View>
      <View style={styles.matchRight}>
        <View style={[styles.matchResultBadge, isWin ? styles.matchWinBadge : styles.matchLossBadge]}>
          <Text style={[styles.matchResultText, { color: isWin ? colors.success : colors.danger }]}>
            {isWin ? 'WIN' : 'LOSS'}
          </Text>
        </View>
        <Text style={[styles.matchXP, { color: isWin ? colors.xpGold : colors.text.muted }]}>
          +{m.xpEarned} XP
        </Text>
        <Text style={styles.matchScore}>{m.score}</Text>
      </View>
    </View>
  );
}

// ─── GamePlayModal ────────────────────────────────────────────────────────────

type GamePhase = 'lobby' | 'countdown' | 'playing' | 'result';

function GamePlayModal({
  game, initialMode, visible, onClose, onEarnXP,
}: {
  game:        Game;
  initialMode: PlayMode;
  visible:     boolean;
  onClose:     () => void;
  onEarnXP:    (amount: number, title: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { addMatch } = useGames();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const MODE_META = useMemo(() => getModeMeta(colors), [colors]);

  const [mode,        setMode]        = useState<PlayMode>(initialMode);
  const [phase,       setPhase]       = useState<GamePhase>('lobby');
  const [countdown,   setCountdown]   = useState(3);
  const [moveIdx,     setMoveIdx]     = useState(0);
  const [score,       setScore]       = useState(0);
  const [elapsed,     setElapsed]     = useState(0);
  const [gameResult,  setGameResult]  = useState<'win' | 'loss'>('win');
  const [xpEarned,    setXpEarned]    = useState(0);

  const countdownAnim = useRef(new Animated.Value(1)).current;
  const resultAnim    = useRef(new Animated.Value(0)).current;

  // Reset when modal reopens
  useEffect(() => {
    if (visible) {
      setMode(initialMode);
      setPhase('lobby');
      setCountdown(3);
      setMoveIdx(0);
      setScore(0);
      setElapsed(0);
    }
  }, [visible, initialMode]);

  // Countdown phase
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown === 0) { setPhase('playing'); return; }
    Animated.sequence([
      Animated.spring(countdownAnim, { toValue: 1.4, useNativeDriver: true, speed: 30 }),
      Animated.spring(countdownAnim, { toValue: 1,   useNativeDriver: true, speed: 30 }),
    ]).start();
    const t = setTimeout(() => setCountdown(c => c - 1), 900);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // Playing phase — advance moves + score every 1.5s, end after ~9s
  useEffect(() => {
    if (phase !== 'playing') return;
    const interval = setInterval(() => {
      setMoveIdx(i => i + 1);
      setScore(s => s + Math.floor(Math.random() * 60) + 20);
      setElapsed(e => e + 1);
    }, 1400);
    const end = setTimeout(() => {
      clearInterval(interval);
      const won    = Math.random() < 0.62;
      const xp     = won ? Math.floor(game.maxXp * (0.6 + Math.random() * 0.4)) : 10;
      const modeLabel = MODE_META[mode].label;
      setGameResult(won ? 'win' : 'loss');
      setXpEarned(xp);
      setPhase('result');
      addMatch({
        gameId: game.id, gameName: game.name, gameEmoji: game.emoji,
        mode, result: won ? 'win' : 'loss',
        xpEarned: xp,
        score: game.name === 'Chess' ? (won ? '1–0' : '0–1')
             : game.name === 'Ludo'  ? (won ? '1st' : '3rd')
             : `${(score + 1200).toLocaleString()} pts`,
        duration: `${Math.floor(elapsed / 60)}m ${(elapsed % 60) + 12}s`,
      });
      if (won) onEarnXP(xp, `${game.name} Win · ${modeLabel}`);
      Animated.spring(resultAnim, { toValue: 1, useNativeDriver: true, speed: 8 }).start();
    }, 9800);
    return () => { clearInterval(interval); clearTimeout(end); };
  }, [phase]);

  const startGame = () => {
    if (mode === 'tournament') {
      Alert.alert('Join Tournament', 'Entry fee: 50 XP will be deducted.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Play', onPress: () => { setPhase('countdown'); setCountdown(3); } },
      ]);
    } else {
      setPhase('countdown');
      setCountdown(3);
    }
  };

  const playAgain = () => {
    setPhase('lobby');
    setMoveIdx(0);
    setScore(0);
    setElapsed(0);
    resultAnim.setValue(0);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.playModal, { paddingTop: insets.top || 16 }]}>

        {/* ── Lobby ── */}
        {phase === 'lobby' && (
          <>
            <View style={styles.playHeader}>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={26} color={colors.text.secondary} />
              </TouchableOpacity>
              <Text style={styles.playHeaderTitle}>{game.name}</Text>
              <View style={{ width: 26 }} />
            </View>
            <ScrollView contentContainerStyle={styles.lobbyContent}>
              {/* Game hero */}
              <LinearGradient colors={game.gradient as [string,string]} style={styles.lobbyHero}>
                <Text style={styles.lobbyEmoji}>{game.emoji}</Text>
                <View style={styles.lobbyOnline}>
                  <View style={styles.onlineDot} />
                  <Text style={styles.lobbyOnlineText}>
                    {game.playersOnline.toLocaleString()} players online
                  </Text>
                </View>
              </LinearGradient>

              {/* Info chips */}
              <View style={styles.lobbyChips}>
                <View style={styles.lobbyChip}>
                  <Text style={styles.lobbyChipVal}>⚡ {game.maxXp}</Text>
                  <Text style={styles.lobbyChipLabel}>Max XP</Text>
                </View>
                <View style={styles.lobbyChip}>
                  <Text style={styles.lobbyChipVal}>~5 min</Text>
                  <Text style={styles.lobbyChipLabel}>Avg. Game</Text>
                </View>
                <View style={styles.lobbyChip}>
                  <Text style={styles.lobbyChipVal}>{game.isHot ? '🔴 HOT' : '⭐ Fun'}</Text>
                  <Text style={styles.lobbyChipLabel}>Status</Text>
                </View>
              </View>

              {/* Mode selector */}
              <Text style={styles.lobbyLabel}>Select Mode</Text>
              {(Object.entries(MODE_META) as [PlayMode, typeof MODE_META[PlayMode]][]).map(([m, meta]) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.lobbyModeRow, mode === m && styles.lobbyModeRowActive]}
                  onPress={() => setMode(m)}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 28 }}>{meta.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lobbyModeRowLabel}>{meta.label}</Text>
                    <Text style={styles.lobbyModeRowSub}>{meta.sub}</Text>
                  </View>
                  <View style={[styles.modeRadio, mode === m && styles.modeRadioActive]}>
                    {mode === m && <View style={styles.modeRadioDot} />}
                  </View>
                </TouchableOpacity>
              ))}

              {/* Play button */}
              <TouchableOpacity onPress={startGame} activeOpacity={0.85} style={{ marginTop: 8 }}>
                <LinearGradient
                  colors={[colors.primary, colors.cyanDark]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.playNowBtn}
                >
                  <Ionicons name="play" size={20} color="#fff" />
                  <Text style={styles.playNowText}>Play Now</Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </>
        )}

        {/* ── Countdown ── */}
        {phase === 'countdown' && (
          <View style={styles.countdownScreen}>
            <Text style={styles.countdownGame}>{game.emoji}</Text>
            <Text style={styles.countdownVs}>
              You vs {MODE_META[mode].label === 'vs Bot' ? 'AI Bot' : 'Online Opponent'}
            </Text>
            <Animated.Text style={[styles.countdownNum, { transform: [{ scale: countdownAnim }] }]}>
              {countdown === 0 ? 'GO!' : countdown}
            </Animated.Text>
            <Text style={styles.countdownSub}>Get ready…</Text>
          </View>
        )}

        {/* ── Playing ── */}
        {phase === 'playing' && (
          <View style={{ flex: 1 }}>
            <View style={styles.playingHeader}>
              <View style={styles.playingScoreBox}>
                <Text style={styles.playingScoreLabel}>Score</Text>
                <Text style={styles.playingScore}>{score.toLocaleString()}</Text>
              </View>
              <View style={styles.playingCenter}>
                <Text style={styles.playingGameName}>{game.name}</Text>
                <Text style={styles.playingTime}>{String(Math.floor(elapsed / 60)).padStart(2,'0')}:{String((elapsed * 1.4 | 0) % 60).padStart(2,'0')}</Text>
              </View>
              <View style={[styles.playingScoreBox, { alignItems: 'flex-end' }]}>
                <Text style={styles.playingScoreLabel}>XP to earn</Text>
                <Text style={[styles.playingScore, { color: colors.xpGold }]}>+{game.maxXp}</Text>
              </View>
            </View>

            {/* Game board */}
            <ScrollView contentContainerStyle={{ alignItems: 'center', paddingVertical: 12 }}>
              {game.id === 'g1' && <ChessBoard moveIdx={moveIdx} />}
              {game.id === 'g2' && <LudoBoard  moveIdx={moveIdx} />}
              {game.id === 'g3' && <BlockBoard  moveIdx={moveIdx} score={score} />}
              {game.id === 'g4' && <CandyBoard  moveIdx={moveIdx} />}

              {/* Move log (chess + ludo) */}
              {(game.id === 'g1' || game.id === 'g2') && (
                <View style={styles.moveLog}>
                  {CHESS_MOVES.slice(0, Math.min(moveIdx + 1, CHESS_MOVES.length)).map((mv, i) => (
                    <View key={i} style={[styles.moveLogRow, mv.player ? styles.moveLogPlayer : styles.moveLogAI]}>
                      <Text style={styles.moveLogEmoji}>{mv.player ? '🧑‍💻' : '🤖'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.moveLogText}>{mv.text}</Text>
                        <Text style={styles.moveLogSub}>{mv.sub}</Text>
                      </View>
                    </View>
                  )).reverse()}
                </View>
              )}
            </ScrollView>
          </View>
        )}

        {/* ── Result ── */}
        {phase === 'result' && (
          <View style={styles.resultScreen}>
            <Animated.View style={[styles.resultCard, {
              transform: [{ scale: resultAnim }],
              opacity: resultAnim,
            }]}>
              <LinearGradient
                colors={gameResult === 'win'
                  ? ['rgba(16,185,129,0.15)', 'rgba(6,182,212,0.08)']
                  : ['rgba(239,68,68,0.15)', 'rgba(180,53,53,0.05)']
                }
                style={styles.resultCardInner}
              >
                <Text style={styles.resultEmoji}>{gameResult === 'win' ? '🏆' : '😔'}</Text>
                <Text style={[styles.resultTitle, { color: gameResult === 'win' ? colors.success : colors.danger }]}>
                  {gameResult === 'win' ? 'You Won!' : 'Better Luck Next Time'}
                </Text>
                <Text style={styles.resultSub}>
                  {gameResult === 'win' ? `Great game! You've earned ${xpEarned} XP.` : 'You earned 10 XP for playing.'}
                </Text>

                <View style={styles.resultStats}>
                  {[
                    { label: 'XP Earned', value: `+${xpEarned}`, color: colors.xpGold },
                    { label: 'Score',     value: `${score.toLocaleString()}`, color: colors.primaryLight },
                    { label: 'Mode',      value: MODE_META[mode].label, color: colors.text.secondary },
                  ].map(s => (
                    <View key={s.label} style={styles.resultStat}>
                      <Text style={[styles.resultStatVal, { color: s.color }]}>{s.value}</Text>
                      <Text style={styles.resultStatLabel}>{s.label}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.resultActions}>
                  <TouchableOpacity style={styles.resultSecondaryBtn} onPress={onClose}>
                    <Text style={styles.resultSecondaryText}>Exit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.resultPrimaryBtnWrap} onPress={playAgain}>
                    <LinearGradient
                      colors={[colors.primary, colors.cyanDark]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={styles.resultPrimaryBtn}
                    >
                      <Ionicons name="refresh" size={16} color="#fff" />
                      <Text style={styles.resultPrimaryText}>Play Again</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </Animated.View>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─── Chess Board ──────────────────────────────────────────────────────────────

function ChessBoard({ moveIdx }: { moveIdx: number }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const cellSize = Math.floor((SCREEN_W - 32) / 8);
  const highlight = CHESS_HIGHLIGHTS[moveIdx % CHESS_HIGHLIGHTS.length];

  return (
    <View style={styles.chessBoard}>
      {CHESS_BOARD.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {row.map((piece, c) => {
            const isLight = (r + c) % 2 === 0;
            const isHighlight = highlight && (
              (r === highlight[0] && c === highlight[1]) ||
              (r === highlight[2] && c === highlight[3])
            );
            return (
              <View
                key={c}
                style={[
                  styles.chessCell,
                  { width: cellSize, height: cellSize },
                  isLight ? styles.chessCellLight : styles.chessCellDark,
                  isHighlight && styles.chessCellHighlight,
                ]}
              >
                <Text style={[
                  styles.chessPiece,
                  { fontSize: cellSize * 0.55 },
                  piece.charCodeAt(0) < 9818 ? styles.chessPieceWhite : styles.chessPieceBlack,
                ]}>
                  {piece}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── Ludo Board ───────────────────────────────────────────────────────────────

function LudoBoard({ moveIdx }: { moveIdx: number }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const size = SCREEN_W - 48;
  const cellSize = Math.floor(size / 6);

  // 4 tokens cycling positions on a simple path
  const TOKEN_PATH_POS = [0, 4, 8, 12, 16, 20];
  const tokenPos = moveIdx % TOKEN_PATH_POS.length;

  const QUADRANT_COLORS: [string,string][] = [
    ['#7F1D1D','#991B1B'], // red
    ['#1E3A5F','#1D4ED8'], // blue
    ['#064E3B','#065F46'], // green
    ['#78350F','#92400E'], // yellow
  ];

  return (
    <View style={[styles.ludoBoard, { width: size, height: size }]}>
      {[0,1,2,3].map(q => {
        const row = q < 2 ? 0 : 1;
        const col = q % 2;
        return (
          <LinearGradient
            key={q}
            colors={QUADRANT_COLORS[q]}
            style={[styles.ludoQuad, {
              width: size / 2 - 2,
              height: size / 2 - 2,
              top: row * (size / 2 + 2),
              left: col * (size / 2 + 2),
            }]}
          >
            <Text style={styles.ludoQuadLabel}>{LUDO_COLORS[q] === '#EF4444' ? '🔴' : q === 1 ? '🔵' : q === 2 ? '🟢' : '🟡'}</Text>
            {/* Token circles */}
            <View style={styles.ludoHomeCircles}>
              {[0,1,2,3].map(i => (
                <View key={i} style={[styles.ludoCircle, {
                  backgroundColor: q === tokenPos % 4 && i === 0 ? '#fff' : 'rgba(255,255,255,0.2)',
                }]} />
              ))}
            </View>
          </LinearGradient>
        );
      })}
      {/* Center star */}
      <View style={[styles.ludoCenter, { width: size * 0.18, height: size * 0.18, top: size * 0.41, left: size * 0.41 }]}>
        <Text style={{ fontSize: size * 0.1 }}>⭐</Text>
      </View>
    </View>
  );
}

// ─── Block Blaster Board ──────────────────────────────────────────────────────

function BlockBoard({ moveIdx, score }: { moveIdx: number; score: number }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const cols = 5;
  const rows = 8;
  const cellSize = Math.floor((SCREEN_W - 48) / cols);

  const grid = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) =>
      (r + c + moveIdx) % BLOCK_COLORS.length
    )
  );

  const clearedRow = moveIdx % rows;

  return (
    <View>
      <View style={styles.blockGrid}>
        {grid.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row' }}>
            {row.map((colorIdx, c) => (
              <View
                key={c}
                style={[
                  styles.blockCell,
                  { width: cellSize - 3, height: cellSize - 3, backgroundColor: BLOCK_COLORS[colorIdx] },
                  r === clearedRow && { opacity: 0.15 },
                ]}
              />
            ))}
          </View>
        ))}
      </View>
      {moveIdx > 0 && (
        <View style={styles.blockCombo}>
          <Text style={styles.blockComboText}>
            {moveIdx % 3 === 0 ? '🔥 COMBO x3!' : moveIdx % 2 === 0 ? '💥 Line Clear!' : '✨ Nice!'}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Candy Connect Board ──────────────────────────────────────────────────────

function CandyBoard({ moveIdx }: { moveIdx: number }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const cols = 5;
  const cellSize = Math.floor((SCREEN_W - 48) / cols);

  // Swap two cells each move
  const grid = Array.from({ length: cols }, (_, r) =>
    Array.from({ length: cols }, (_, c) => CANDY_EMOJIS[(r * cols + c + moveIdx) % CANDY_EMOJIS.length])
  );

  return (
    <View style={styles.candyGrid}>
      {grid.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 4 }}>
          {row.map((emoji, c) => (
            <View key={c} style={[styles.candyCell, { width: cellSize - 4, height: cellSize - 4 }]}>
              <Text style={{ fontSize: cellSize * 0.45 }}>{emoji}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── HistoryModal ─────────────────────────────────────────────────────────────

function HistoryModal({ visible, matches, onClose }: { visible: boolean; matches: GameMatch[]; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [filter, setFilter] = useState<'all' | 'win' | 'loss'>('all');

  const filtered = matches.filter(m => filter === 'all' || m.result === filter);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalShell, { paddingTop: insets.top || 16 }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Match History</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.histFilterRow}>
          {(['all', 'win', 'loss'] as const).map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.histFilterChip, filter === f && styles.histFilterChipActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.histFilterText, filter === f && styles.histFilterTextActive]}>
                {f === 'all' ? 'All' : f === 'win' ? '🏆 Wins' : '😔 Losses'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView>
          {filtered.map(m => <MatchRow key={m.id} match={m} />)}
          {filtered.length === 0 && (
            <View style={styles.histEmpty}>
              <Text style={styles.histEmptyText}>No {filter === 'all' ? '' : filter} matches yet</Text>
            </View>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── LeaderboardModal ─────────────────────────────────────────────────────────

function LeaderboardModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalShell, { paddingTop: insets.top || 16 }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>🏆 Leaderboard</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Top 3 podium */}
          <View style={styles.podium}>
            {[LEADERBOARD[1], LEADERBOARD[0], LEADERBOARD[2]].filter(Boolean).map((e, i) => {
              const isCenter = i === 1;
              const medals = ['🥈', '🥇', '🥉'];
              return (
                <View key={e.rank} style={[styles.podiumItem, isCenter && styles.podiumCenter]}>
                  <Text style={{ fontSize: isCenter ? 40 : 32 }}>{e.avatar}</Text>
                  <Text style={styles.podiumMedal}>{medals[i]}</Text>
                  <Text style={styles.podiumName} numberOfLines={1}>{e.user}</Text>
                  <Text style={styles.podiumXP}>⚡ {e.xp.toLocaleString()}</Text>
                  <View style={[styles.podiumBar, {
                    height: isCenter ? 70 : 50,
                    backgroundColor: i === 1 ? 'rgba(251,191,36,0.3)'
                      : i === 0 ? 'rgba(148,163,184,0.2)' : 'rgba(205,124,47,0.2)',
                  }]} />
                </View>
              );
            })}
          </View>

          {/* Rest of leaderboard */}
          {LEADERBOARD.slice(3).map((e, i) => (
            <View key={e.rank} style={styles.lbFullRow}>
              <Text style={[styles.lbRank, { color: colors.text.muted, width: 28 }]}>{e.rank}</Text>
              <View style={styles.lbAvatar}><Text style={{ fontSize: 18 }}>{e.avatar}</Text></View>
              <Text style={styles.lbName}>{e.user}</Text>
              <Text style={styles.lbXp}>⚡ {e.xp.toLocaleString()}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
  container:  { flex: 1, backgroundColor: c.bg.base },
  headerGrad: { paddingBottom: 12 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingTop: 8, paddingBottom: 12,
  },
  title:    { fontSize: fontSizes.xxl, fontWeight: '800', color: c.text.primary },
  subtitle: { fontSize: fontSizes.sm, color: c.text.muted, marginTop: 2 },
  historyBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: c.bg.card, borderWidth: 1, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center',
  },
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg },
  statCard: {
    flex: 1, backgroundColor: c.bg.card,
    borderRadius: radii.md, borderWidth: 1, borderColor: c.border,
    padding: 8, alignItems: 'center',
  },
  statVal:   { fontSize: fontSizes.md, fontWeight: '800', marginBottom: 1 },
  statLabel: { fontSize: 9, color: c.text.muted, textAlign: 'center', fontWeight: '600' },

  tabRow: {
    flexDirection: 'row', marginHorizontal: spacing.lg, marginBottom: 10,
    backgroundColor: c.bg.card, borderRadius: radii.md,
    borderWidth: 1, borderColor: c.border, padding: 3,
  },
  tab:           { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: radii.sm - 2 },
  tabActive:     { backgroundColor: c.primary },
  tabText:       { fontSize: fontSizes.xs, color: c.text.muted, fontWeight: '600' },
  tabTextActive: { color: '#fff', fontWeight: '700' },

  sectionLabel: {
    fontSize: fontSizes.xs, color: c.text.muted,
    fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.1,
    paddingHorizontal: spacing.xl, marginBottom: 10,
  },

  // Tournament banner
  tournBanner:      { marginHorizontal: spacing.lg, marginBottom: 14, borderRadius: radii.lg, overflow: 'hidden' },
  tournBannerInner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: spacing.md, borderWidth: 1, borderColor: 'rgba(124,58,237,0.32)', borderRadius: radii.lg,
  },
  tournIcon: { width: 50, height: 50, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  tournInfo: { flex: 1 },
  tournTitle: { fontSize: fontSizes.md, fontWeight: '800', color: c.text.primary, marginBottom: 3 },
  tournMeta:  { fontSize: fontSizes.xs, color: c.text.muted, marginBottom: 6 },
  tournProgress: { height: 3, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: radii.full, overflow: 'hidden' },
  tournProgressFill: { height: '100%', backgroundColor: c.primary, borderRadius: radii.full },
  joinBtn: { backgroundColor: c.primary, borderRadius: radii.full, paddingVertical: 8, paddingHorizontal: 14 },
  joinBtnText: { fontSize: fontSizes.sm, fontWeight: '700', color: '#fff' },

  // Game grid
  gameGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.lg, gap: 12, marginBottom: 8 },
  gameCard: { width: CARD_W, backgroundColor: c.bg.card, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
  gameThumb: { height: 104, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  gameEmoji: { fontSize: 46 },
  hotBadge:  { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(239,68,68,0.9)', paddingVertical: 2, paddingHorizontal: 6, borderRadius: radii.full },
  hotText:   { fontSize: fontSizes.xs - 1, fontWeight: '800', color: '#fff' },
  onlineRow: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 2, paddingHorizontal: 7, borderRadius: radii.full },
  onlineDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: c.success },
  onlineText:{ fontSize: fontSizes.xs - 1, color: c.text.secondary },
  gameInfo:  { padding: 10 },
  gameName:  { fontSize: fontSizes.sm, fontWeight: '800', color: c.text.primary, marginBottom: 2 },
  gameXp:    { fontSize: fontSizes.xs, color: c.xpGold, marginBottom: 8 },
  gamePlayBtn: { backgroundColor: 'rgba(124,58,237,0.2)', borderRadius: radii.full, paddingVertical: 4, alignItems: 'center' },
  gamePlayBtnText: { fontSize: fontSizes.xs, fontWeight: '700', color: c.primaryLight },

  // Play modes
  modeRow: { paddingHorizontal: spacing.lg, gap: 10, marginBottom: 14 },
  modeCard: { width: 110, backgroundColor: c.bg.card, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border, padding: 12, alignItems: 'center', gap: 4 },
  modeEmoji: { fontSize: 28, marginBottom: 2 },
  modeLabel: { fontSize: fontSizes.sm, fontWeight: '700', color: c.text.primary },
  modeSub:   { fontSize: fontSizes.xs, color: c.text.muted, textAlign: 'center' },

  // Leaderboard widget
  lbCard: { marginHorizontal: spacing.lg, backgroundColor: c.bg.card, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
  lbHead: { paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: c.border },
  lbTitle: { fontSize: fontSizes.sm, fontWeight: '700', color: c.text.primary },
  lbAll:   { fontSize: fontSizes.xs, color: c.primaryLight },
  lbRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border },
  lbRank:  { fontSize: fontSizes.md, fontWeight: '800', width: 20, textAlign: 'center' },
  lbAvatar:{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.bg.elevated, alignItems: 'center', justifyContent: 'center' },
  lbName:  { flex: 1, fontSize: fontSizes.sm, color: c.text.primary },
  lbXp:    { fontSize: fontSizes.sm, fontWeight: '700', color: c.xpGold },

  // Tournament tab cards
  tournCard: { marginHorizontal: spacing.lg, marginBottom: 14, backgroundColor: c.bg.card, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
  tournCardBanner: { height: 80, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12 },
  tournEndsChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(251,191,36,0.15)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)', borderRadius: radii.full, paddingHorizontal: 8, paddingVertical: 3 },
  tournEndsText: { fontSize: fontSizes.xs, color: c.xpGold, fontWeight: '600' },
  tournCardBody: { padding: spacing.md, gap: 10 },
  tournCardName: { fontSize: fontSizes.md, fontWeight: '800', color: c.text.primary },
  tournCardGame: { fontSize: fontSizes.xs, color: c.text.muted },
  tournPrizeRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.bg.elevated, borderRadius: radii.md, padding: spacing.sm },
  tournPrizeItem: { flex: 1, alignItems: 'center' },
  tournPrizeVal:  { fontSize: fontSizes.md, fontWeight: '800', color: c.text.primary },
  tournPrizeLabel:{ fontSize: fontSizes.xs, color: c.text.muted, marginTop: 2 },
  tournPrizeDivider: { width: 1, height: 28, backgroundColor: c.border },
  tournProgressWrap: { gap: 4 },
  tournProgressLabel: { fontSize: fontSizes.xs, color: c.text.muted, textAlign: 'right' },
  tournProgressBar: { height: 5, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: radii.full, overflow: 'hidden' },
  tournJoinBtn:    { borderRadius: radii.full, overflow: 'hidden' },
  tournJoinBtnReg: {},
  tournJoinBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: radii.full },
  tournJoinBtnText: { fontSize: fontSizes.sm, fontWeight: '700', color: '#fff' },

  // History tab
  histStatsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  histStatCard: { flex: 1, backgroundColor: c.bg.card, borderRadius: radii.md, borderWidth: 1, borderColor: c.border, padding: 10, alignItems: 'center' },
  histStatVal:  { fontSize: fontSizes.md, fontWeight: '800', color: c.text.primary },
  histStatLabel:{ fontSize: fontSizes.xs - 1, color: c.text.muted, textAlign: 'center' },

  // Match row
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  matchGameIcon: { width: 44, height: 44, borderRadius: radii.md, backgroundColor: c.bg.card, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  matchInfo:    { flex: 1 },
  matchGameName:{ fontSize: fontSizes.sm, fontWeight: '700', color: c.text.primary },
  matchMeta:    { fontSize: fontSizes.xs, color: c.text.secondary, marginTop: 1 },
  matchDate:    { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 1 },
  matchRight:   { alignItems: 'flex-end', gap: 3 },
  matchResultBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.full, borderWidth: 1 },
  matchWinBadge:    { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.3)' },
  matchLossBadge:   { backgroundColor: 'rgba(239,68,68,0.1)',   borderColor: 'rgba(239,68,68,0.25)' },
  matchResultText:  { fontSize: fontSizes.xs, fontWeight: '800' },
  matchXP:          { fontSize: fontSizes.xs, fontWeight: '700' },
  matchScore:       { fontSize: fontSizes.xs, color: c.text.muted },

  // Game play modal
  playModal:    { flex: 1, backgroundColor: '#05050F' },
  playHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 12 },
  playHeaderTitle: { fontSize: fontSizes.lg, fontWeight: '800', color: c.text.primary },

  // Lobby
  lobbyContent: { paddingHorizontal: spacing.lg, paddingBottom: 40, gap: spacing.md },
  lobbyHero: { height: 160, borderRadius: radii.xl, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  lobbyEmoji: { fontSize: 72 },
  lobbyOnline: { position: 'absolute', bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: radii.full },
  lobbyOnlineText: { fontSize: fontSizes.xs, color: '#fff', fontWeight: '600' },
  lobbyChips: { flexDirection: 'row', gap: 8 },
  lobbyChip: { flex: 1, backgroundColor: c.bg.card, borderRadius: radii.md, borderWidth: 1, borderColor: c.border, padding: 10, alignItems: 'center', gap: 3 },
  lobbyChipVal:   { fontSize: fontSizes.sm, fontWeight: '800', color: c.text.primary },
  lobbyChipLabel: { fontSize: fontSizes.xs, color: c.text.muted },
  lobbyLabel: { fontSize: fontSizes.sm, fontWeight: '700', color: c.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  lobbyModeRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.bg.card, borderWidth: 1, borderColor: c.border, borderRadius: radii.lg, padding: spacing.md },
  lobbyModeRowActive: { borderColor: c.primaryLight, backgroundColor: 'rgba(124,58,237,0.1)' },
  lobbyModeRowLabel:  { fontSize: fontSizes.md, fontWeight: '700', color: c.text.primary },
  lobbyModeRowSub:    { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 2 },
  modeRadio:       { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  modeRadioActive: { borderColor: c.primaryLight },
  modeRadioDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: c.primaryLight },
  playNowBtn: { borderRadius: radii.full, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  playNowText: { fontSize: fontSizes.lg, fontWeight: '800', color: '#fff' },

  // Countdown
  countdownScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  countdownGame:   { fontSize: 80 },
  countdownVs:     { fontSize: fontSizes.md, color: c.text.secondary },
  countdownNum:    { fontSize: 100, fontWeight: '900', color: '#fff' },
  countdownSub:    { fontSize: fontSizes.md, color: c.text.muted },

  // Playing
  playingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  playingScoreBox:   { alignItems: 'flex-start' },
  playingScoreLabel: { fontSize: fontSizes.xs, color: c.text.muted, fontWeight: '600' },
  playingScore:      { fontSize: fontSizes.xl, fontWeight: '800', color: c.text.primary },
  playingCenter:     { alignItems: 'center' },
  playingGameName:   { fontSize: fontSizes.sm, fontWeight: '700', color: c.primaryLight },
  playingTime:       { fontSize: fontSizes.xxl, fontWeight: '800', color: c.text.primary },

  // Chess board
  chessBoard:         { borderRadius: radii.sm, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)' },
  chessCell:          { alignItems: 'center', justifyContent: 'center' },
  chessCellLight:     { backgroundColor: '#F0D9B5' },
  chessCellDark:      { backgroundColor: '#B58863' },
  chessCellHighlight: { backgroundColor: 'rgba(252,211,77,0.85)' },
  chessPiece:         { textAlign: 'center' },
  chessPieceWhite:    { color: '#FFF' },
  chessPieceBlack:    { color: '#1a1a1a' },

  // Ludo board
  ludoBoard:    { position: 'relative', backgroundColor: c.bg.elevated, borderRadius: radii.md, overflow: 'hidden' },
  ludoQuad:     { position: 'absolute', borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', gap: 8 },
  ludoQuadLabel:{ fontSize: 32 },
  ludoHomeCircles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, width: 60 },
  ludoCircle:   { width: 20, height: 20, borderRadius: 10 },
  ludoCenter:   { position: 'absolute', backgroundColor: c.bg.elevated, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' },

  // Block board
  blockGrid: { gap: 3 },
  blockCell: { borderRadius: 4, margin: 1.5 },
  blockCombo: { alignItems: 'center', marginTop: 10 },
  blockComboText: { fontSize: fontSizes.lg, fontWeight: '800', color: c.xpGold },

  // Candy board
  candyGrid: { gap: 4, alignItems: 'center' },
  candyCell: { backgroundColor: c.bg.elevated, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },

  // Move log
  moveLog: { width: SCREEN_W - 32, marginTop: 12, gap: 6 },
  moveLogRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.bg.card, borderRadius: radii.md, padding: 10, borderWidth: 1, borderColor: c.border },
  moveLogPlayer: { borderColor: 'rgba(124,58,237,0.35)' },
  moveLogAI:     { borderColor: 'rgba(6,182,212,0.25)' },
  moveLogEmoji:  { fontSize: 20 },
  moveLogText:   { fontSize: fontSizes.sm, fontWeight: '700', color: c.text.primary },
  moveLogSub:    { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 1 },

  // Result screen
  resultScreen:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  resultCard:     { width: '100%' },
  resultCardInner:{ borderRadius: radii.xl, padding: spacing.xxl, alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: c.border },
  resultEmoji:    { fontSize: 64 },
  resultTitle:    { fontSize: fontSizes.h2, fontWeight: '900', textAlign: 'center' },
  resultSub:      { fontSize: fontSizes.sm, color: c.text.secondary, textAlign: 'center' },
  resultStats:    { flexDirection: 'row', gap: 20, marginTop: 8 },
  resultStat:     { alignItems: 'center', gap: 3 },
  resultStatVal:  { fontSize: fontSizes.xl, fontWeight: '800' },
  resultStatLabel:{ fontSize: fontSizes.xs, color: c.text.muted },
  resultActions:  { flexDirection: 'row', gap: 12, marginTop: 8, width: '100%' },
  resultSecondaryBtn: { flex: 1, backgroundColor: c.bg.elevated, borderRadius: radii.full, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: c.border },
  resultSecondaryText:{ fontSize: fontSizes.sm, fontWeight: '700', color: c.text.secondary },
  resultPrimaryBtnWrap: { flex: 2, borderRadius: radii.full, overflow: 'hidden' },
  resultPrimaryBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: radii.full },
  resultPrimaryText: { fontSize: fontSizes.sm, fontWeight: '700', color: '#fff' },

  // Shared modal shell
  modalShell:  { flex: 1, backgroundColor: c.bg.base },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.border },
  modalTitle:  { fontSize: fontSizes.lg, fontWeight: '700', color: c.text.primary },

  // History modal
  histFilterRow: { flexDirection: 'row', gap: 8, padding: spacing.lg, paddingBottom: spacing.sm },
  histFilterChip: { paddingVertical: 6, paddingHorizontal: 16, borderRadius: radii.full, borderWidth: 1, borderColor: c.border },
  histFilterChipActive: { backgroundColor: 'rgba(124,58,237,0.18)', borderColor: c.primary },
  histFilterText:       { fontSize: fontSizes.xs, color: c.text.muted, fontWeight: '600' },
  histFilterTextActive: { color: c.primaryLight },
  histEmpty:     { padding: 40, alignItems: 'center' },
  histEmptyText: { color: c.text.muted, fontSize: fontSizes.sm },

  // Leaderboard modal
  podium:      { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xxl, gap: 8 },
  podiumItem:  { flex: 1, alignItems: 'center', gap: 4 },
  podiumCenter:{ marginBottom: 10 },
  podiumMedal: { fontSize: 24, marginTop: -6 },
  podiumName:  { fontSize: fontSizes.xs, fontWeight: '700', color: c.text.primary, textAlign: 'center' },
  podiumXP:    { fontSize: fontSizes.xs, color: c.xpGold, fontWeight: '600' },
  podiumBar:   { width: '100%', borderRadius: radii.sm, marginTop: 6 },
  lbFullRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
});
}
