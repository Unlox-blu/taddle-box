import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Image,  Dimensions, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { HtmlGameResult } from '../../games/types';
import { createGameEngineSocket } from '../../services/socketClient';
import { gameSound } from '../../services/gameSound';
import { themedAlert } from '../common/ThemedAlert';

const { width } = Dimensions.get('window');
const GRID_COLS = 4;
const TILE_GAP = 10;
const BOARD_PADDING = 20;
const TILE_SIZE = Math.floor((width - BOARD_PADDING * 2 - TILE_GAP * (GRID_COLS - 1)) / GRID_COLS);

const E = {
  READY: 'READY', MOVE: 'MOVE',
  CONNECT_ACK: 'CONNECT', START: 'START', SYNC: 'SYNC',
  GAME_OVER: 'GAME_OVER', ERROR: 'ERROR', STATE: 'STATE',
};

export type PlayerContext = {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
  team?: number;
  seat?: number;
};

type Props = {
  matchId: string;
  userId: string;
  wsToken: string;
  players?: PlayerContext[];
  /** Mirrors the GamePlayModal phase — the 90s round clock only starts once
      the 3-2-1 countdown finishes, so the countdown never burns round time. */
  externalPhase?: "playing" | "waiting";
  onComplete: (result: HtmlGameResult) => void;
};

type FoundWord = { word: string; score: number; userId: string };

export default function WordRushGame({ matchId, userId, wsToken, externalPhase = "waiting", onComplete }: Props) {
  const [socket, setSocket] = useState<any>(null);
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'active' | 'finished'>('connecting');
  const [grid, setGrid] = useState<string[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [foundWords, setFoundWords] = useState<FoundWord[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState(90);
  const [round, setRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(1);
  const [lastResult, setLastResult] = useState<'valid' | 'invalid' | 'duplicate' | null>(null);
  const [lastError, setLastError] = useState<string>('');
  // The exact word that was accepted — captured before the selection is cleared
  // so the "✅ WORD" flash doesn't render an empty string.
  const [lastValidWord, setLastValidWord] = useState('');
  const lastValidWordRef = useRef('');
  const [submitting, setSubmitting] = useState(false);
  const resultAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<any>(null);
  const timerBarAnim = useRef(new Animated.Value(1)).current;
  const roundRef = useRef(0);
  const externalPhaseRef = useRef(externalPhase);
  useEffect(() => { externalPhaseRef.current = externalPhase; }, [externalPhase]);
  // The engine fires START only after every player's board is visible — READY
  // is sent once the 3-2-1 countdown finishes, never on connect, so the 90s
  // round clock and the countdown never overlap.
  const readySentRef = useRef(false);
  // Bumped on every CONNECT_ACK so a reconnect during the waiting phase
  // re-arms READY (the server drops the player from readyPlayers on
  // disconnect — without re-sending, the match would never start).
  const [readyTick, setReadyTick] = useState(0);

  useEffect(() => {
    const s = createGameEngineSocket(matchId, userId, wsToken);
    setSocket(s);

    s.on(E.CONNECT_ACK, (data: any) => {
      const ps = data.state?.pluginState;
      if (ps) applyState(ps);
      setStatus(data.state?.status === 'ACTIVE' ? 'active' : 'waiting');
      // Reconnect (or fresh join) — re-arm the READY gate.
      readySentRef.current = false;
      setReadyTick((t) => t + 1);
    });

    s.on(E.START, (data: any) => {
      // Server emits { state: fullMatchState, startedAt }
      const ps = data.state?.pluginState ?? data.state;
      if (ps) {
        applyState(ps);
        // Only kick the 90s clock now if the board is already visible (rejoin
        // into a live match); fresh matches wait for the countdown effect.
        if (externalPhaseRef.current === "playing") {
          startLocalTimer(90);
        }
      }
      setStatus('active');
    });

    s.on(E.SYNC, (data: any) => {
      // Server emits { state: pluginState } after each move
      if (!data.state) return;
      applyState(data.state);
      setSubmitting(false);

      // Only flash success for OUR words (SYNC also fires for bot moves / round
      // advances, which used to show a false "correct!" flash).
      if (
        (data.result === 'VALID' || data.valid === true) &&
        (!data.userId || data.userId === userId)
      ) {
        triggerSuccess();
      }
    });

    // Keep the board in sync on intermediate STATE broadcasts too.
    s.on(E.STATE, (data: any) => {
      if (data.state?.pluginState) applyState(data.state.pluginState);
    });

    s.on(E.GAME_OVER, (data: any) => {
      setStatus('finished');
      clearInterval(timerRef.current);
      const ps = data.state?.pluginState ?? data.state;
      const myScore = ps?.scores?.[userId] || 0;
      const allScores = Object.values<number>(ps?.scores || { _: 0 });
      const maxScore = allScores.length ? Math.max(...allScores) : 0;
      const won = myScore >= maxScore && myScore > 0;
      themedAlert(
        won ? '🏆 You Won!' : '😔 Good Try!',
        `Your score: ${myScore} pts`,
        [{ text: 'OK', onPress: () => onComplete({ score: myScore, won, xpEarned: won ? 50 : 10, durationSeconds: 0 }) }]
      );
    });

    s.on(E.ERROR, (e: any) => {
      setSubmitting(false);
      const msg = (e.message || '').toLowerCase();
      if (msg.includes('already used') || msg.includes('duplicate')) {
        setLastError('Already used!');
        setLastResult('duplicate');
        triggerShake();
      } else if (
        msg.includes('not a valid') ||
        msg.includes('not found') ||
        msg.includes('dictionary') ||
        msg.includes('too short') ||
        msg.includes('does not spell') ||
        msg.includes('adjacent') ||
        msg.includes('invalid path') ||
        msg.includes('invalid move')
      ) {
        setLastError('Not a word!');
        setLastResult('invalid');
        triggerShake();
      } else {
        themedAlert('Error', e.message || 'Something went wrong');
      }
    });

    return () => { s.disconnect(); clearInterval(timerRef.current); };
  }, [matchId, userId, wsToken]);

  // Send READY the moment the board is actually visible (after the 3-2-1).
  useEffect(() => {
    if (externalPhase !== 'playing' || readySentRef.current || !socket) return;
    readySentRef.current = true;
    socket.emit(E.READY);
  }, [externalPhase, socket, readyTick]);

  const applyState = (ps: any) => {
    if (ps.grid && Array.isArray(ps.grid)) setGrid(ps.grid);
    if (ps.scores) setScores(ps.scores);
    if (ps.foundWords && Array.isArray(ps.foundWords)) setFoundWords(ps.foundWords);
    if (ps.currentRound) {
      // Grid regenerates on each round — clear any stale selection and restart
      // the local countdown so the UI matches the server's 90s round cadence.
      // Note: read ps.status (fresh from the payload) rather than the `status`
      // closure value, which is stale inside this effect and would never equal
      // 'active'.
      if (ps.currentRound !== roundRef.current) {
        roundRef.current = ps.currentRound;
        setSelectedIndices([]);
        // Only (re)start the visible clock when the board is actually on screen.
        // The initial 0→1 round change arrives on CONNECT_ACK, before the 3-2-1
        // countdown — starting then would burn round time behind the countdown.
        if (ps.status !== 'finished' && externalPhaseRef.current === 'playing') {
          startLocalTimer(90);
        }
      }
      setRound(ps.currentRound);
    }
    if (ps.totalRounds) setTotalRounds(ps.totalRounds);
  };

  // The 3-2-1 countdown hides the board — start the round clock only when it's
  // visible so the countdown never burns round time.
  useEffect(() => {
    if (status === 'active' && externalPhase === 'playing' && !timerRef.current) {
      startLocalTimer(90);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, externalPhase]);

  const startLocalTimer = (total: number) => {
    clearInterval(timerRef.current);
    setTimeLeft(total);
    timerBarAnim.setValue(1);
    Animated.timing(timerBarAnim, {
      toValue: 0,
      duration: total * 1000,
      useNativeDriver: false,
    }).start();

    let t = total;
    timerRef.current = setInterval(() => {
      t -= 1;
      setTimeLeft(t);
      if (t <= 0) clearInterval(timerRef.current);
    }, 1000);
  };

  const triggerSuccess = () => {
    gameSound.playCorrect();
    // Capture the accepted word before clearing the selection, so the flash
    // preview shows "✅ WORD" instead of an empty string.
    const word = lastValidWordRef.current || selectedWordRef.current || '';
    setLastValidWord(word);
    resultAnim.setValue(0);
    Animated.sequence([
      Animated.spring(resultAnim, { toValue: 1, useNativeDriver: true, speed: 20 }),
      Animated.delay(600),
      Animated.timing(resultAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setLastResult(null));
    setLastResult('valid');
    setSelectedIndices([]);
  };

  const triggerShake = () => {
    gameSound.playError();
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => setLastResult(null), 800);
    });
    setSelectedIndices([]);
  };

  // ── Tile interaction ──────────────────────────────────────────────────────
  const onTilePress = useCallback((idx: number) => {
    if (status !== 'active') return;
    setSelectedIndices(prev => {
      // Deselect if tapping last selected tile
      if (prev.length > 0 && prev[prev.length - 1] === idx) {
        return prev.slice(0, -1);
      }
      // Already in chain — ignore
      if (prev.includes(idx)) return prev;
      // Enforce adjacency from last tile
      if (prev.length > 0) {
        const lastIdx = prev[prev.length - 1];
        const r1 = Math.floor(lastIdx / 4), c1 = lastIdx % 4;
        const r2 = Math.floor(idx / 4), c2 = idx % 4;
        if (Math.abs(r1 - r2) > 1 || Math.abs(c1 - c2) > 1) return prev;
      }
      return [...prev, idx];
    });
  }, [status]);

  const submitWord = useCallback(() => {
    if (selectedIndices.length < 3 || submitting || !socket) return;
    const word = selectedIndices.map(i => grid[i] || '').join('').toUpperCase();
    lastValidWordRef.current = word;
    setSubmitting(true);
    socket.emit(E.MOVE, { type: 'SUBMIT_WORD', path: selectedIndices, word });
    gameSound.playTap();
  }, [selectedIndices, grid, socket, submitting]);

  const clearSelection = useCallback(() => {
    setSelectedIndices([]);
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────────
  const selectedWord = selectedIndices.map(i => grid[i] || '').join('').toUpperCase();
  const selectedWordRef = useRef(selectedWord);
  selectedWordRef.current = selectedWord;
  const myScore = scores[userId] || 0;
  // Opponent score: the other real player, or the bot if no human opponent.
  const oppId =
    Object.keys(scores).find(id => id !== userId && !id.startsWith('bot_')) ||
    Object.keys(scores).find(id => id.startsWith('bot_'));
  const opponentScore = oppId ? scores[oppId] || 0 : 0;
  const myFoundWords = foundWords.filter(w => w.userId === userId);
  const isValid = selectedIndices.length >= 3;

  // Determine adjacent tiles for highlight
  const adjacentToLast = new Set<number>();
  if (selectedIndices.length > 0) {
    const last = selectedIndices[selectedIndices.length - 1];
    const r = Math.floor(last / 4), c = last % 4;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < 4 && nc >= 0 && nc < 4) {
          const ni = nr * 4 + nc;
          if (!selectedIndices.includes(ni)) adjacentToLast.add(ni);
        }
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (status === 'connecting') {
    return (
      <View style={styles.fullCenter}>
        <View style={styles.connectingPulse}>
          <Text style={styles.connectingIcon}>🔤</Text>
        </View>
        <Text style={styles.connectingTitle}>Word Rush</Text>
        <Text style={styles.connectingSubtitle}>Connecting to match…</Text>
      </View>
    );
  }

  if (status === 'waiting') {
    return (
      <View style={styles.fullCenter}>
        <View style={styles.waitingCard}>
          <Text style={styles.waitingIcon}>⏳</Text>
          <Text style={styles.waitingTitle}>Waiting for opponent</Text>
          <Text style={styles.waitingSubtitle}>Get ready to rush those words!</Text>
          <View style={styles.dotRow}>
            {[0, 1, 2].map(i => <WaitDot key={i} delay={i * 200} />)}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.roundLabel}>ROUND {round} / {totalRounds}</Text>
          <Text style={styles.title}>Word Rush</Text>
        </View>
        <View style={styles.timerWrap}>
          <Text style={[styles.timerText, timeLeft <= 15 && styles.timerUrgent]}>{timeLeft}s</Text>
          <View style={styles.timerTrack}>
            <Animated.View style={[
              styles.timerBar,
              { width: timerBarAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
              timeLeft <= 15 && styles.timerBarUrgent,
            ]} />
          </View>
        </View>
      </View>

      {/* Score strip */}
      <View style={styles.scoreStrip}>
        <View style={styles.scoreItem}>
          <Text style={styles.scoreNum}>{myScore}</Text>
          <Text style={styles.scoreLabel}>My Score</Text>
        </View>
        <View style={styles.scoreDiv} />
        <View style={styles.scoreItem}>
          <Text style={styles.scoreNum}>{opponentScore}</Text>
          <Text style={styles.scoreLabel}>Opponent</Text>
        </View>
        <View style={styles.scoreDiv} />
        <View style={styles.scoreItem}>
          <Text style={styles.scoreNum}>{myFoundWords.length}</Text>
          <Text style={styles.scoreLabel}>Words Found</Text>
        </View>
        <View style={styles.scoreDiv} />
        <View style={styles.scoreItem}>
          <Text style={styles.scoreNum}>{selectedIndices.length}</Text>
          <Text style={styles.scoreLabel}>Selected</Text>
        </View>
      </View>

      {/* Word preview bar */}
      <Animated.View style={[
        styles.wordPreview,
        lastResult === 'valid' && styles.wordPreviewValid,
        lastResult === 'invalid' && styles.wordPreviewInvalid,
        lastResult === 'duplicate' && styles.wordPreviewDuplicate,
        { transform: [{ translateX: shakeAnim }] },
      ]}>
        {lastResult === 'valid' ? (
          <Text style={styles.wordPreviewValidText}>✅ {lastValidWord || selectedWord || '...'}</Text>
        ) : lastResult === 'invalid' || lastResult === 'duplicate' ? (
          <Text style={styles.wordPreviewInvalidText}>❌ {lastError}</Text>
        ) : selectedIndices.length > 0 ? (
          <Text style={styles.wordPreviewText}>{selectedWord}</Text>
        ) : (
          <Text style={styles.wordPreviewHint}>Tap adjacent letters to form words</Text>
        )}
      </Animated.View>

      {/* 4×4 Grid */}
      <View style={styles.gridContainer}>
        <View style={styles.grid}>
          {(grid.length === 16 ? grid : Array(16).fill('?')).map((letter, idx) => {
            const isSelected = selectedIndices.includes(idx);
            const selOrder = selectedIndices.indexOf(idx);
            const isAdjacent = adjacentToLast.has(idx) && selectedIndices.length > 0;
            const isLast = selectedIndices.length > 0 && selectedIndices[selectedIndices.length - 1] === idx;

            return (
              <TouchableOpacity
                key={idx}
                onPress={() => onTilePress(idx)}
                activeOpacity={0.7}
                style={[
                  styles.tile,
                  isSelected && styles.tileSelected,
                  isLast && styles.tileLast,
                  isAdjacent && !isSelected && styles.tileAdjacent,
                ]}
              >
                {isSelected && (
                  <LinearGradient
                    colors={isLast ? ['#A855F7', '#7C3AED'] : ['#7C3AED', '#0891B2']}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  />
                )}
                <Text style={[styles.tileText, isSelected && styles.tileTextSelected]}>
                  {letter}
                </Text>
                {isSelected && (
                  <View style={styles.tileOrderBadge}>
                    <Text style={styles.tileOrderText}>{selOrder + 1}</Text>
                  </View>
                )}
                {isAdjacent && !isSelected && <View style={styles.adjacentDot} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.clearBtn} onPress={clearSelection} disabled={selectedIndices.length === 0}>
          <Text style={[styles.clearBtnText, selectedIndices.length === 0 && { opacity: 0.35 }]}>✕ Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitBtn, (!isValid || submitting) && styles.submitBtnDisabled]}
          onPress={submitWord}
          disabled={!isValid || submitting}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={isValid && !submitting ? ['#7C3AED', '#0891B2'] : ['#1E293B', '#1E293B']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.submitGradient}
          >
            <Text style={[styles.submitText, (!isValid || submitting) && { color: '#475569' }]}>
              {submitting ? 'Checking…' : isValid ? `Submit "${selectedWord}"` : 'Select 3+ letters'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Found words */}
      {myFoundWords.length > 0 && (
        <View style={styles.foundSection}>
          <Text style={styles.foundTitle}>YOUR WORDS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.foundScroll}>
            {myFoundWords.slice().reverse().map((fw, i) => (
              <View key={i} style={styles.foundChip}>
                <Text style={styles.foundWord}>{fw.word}</Text>
                <Text style={styles.foundScore}>+{fw.score}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// Animated waiting dot
function WaitDot({ delay }: { delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[styles.dot, { opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]} />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05050F', paddingHorizontal: BOARD_PADDING, paddingTop: 12 },

  // Full-screen states
  fullCenter: { flex: 1, backgroundColor: '#05050F', justifyContent: 'center', alignItems: 'center', padding: 24 },
  connectingPulse: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(124,58,237,0.15)', justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 2, borderColor: 'rgba(124,58,237,0.3)' },
  connectingIcon: { fontSize: 36 },
  connectingTitle: { fontSize: 26, fontWeight: '900', color: '#F8FAFC', marginBottom: 8 },
  connectingSubtitle: { fontSize: 14, color: '#64748B' },
  waitingCard: { backgroundColor: '#0F172A', borderRadius: 24, padding: 32, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(124,58,237,0.25)' },
  waitingIcon: { fontSize: 48, marginBottom: 16 },
  waitingTitle: { fontSize: 20, fontWeight: '900', color: '#F8FAFC', marginBottom: 8 },
  waitingSubtitle: { fontSize: 14, color: '#64748B', marginBottom: 20 },
  dotRow: { flexDirection: 'row', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#7C3AED' },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  roundLabel: { fontSize: 10, color: '#7C3AED', fontWeight: '800', letterSpacing: 1.5, marginBottom: 2 },
  title: { fontSize: 22, fontWeight: '900', color: '#F8FAFC' },
  timerWrap: { alignItems: 'flex-end' },
  timerText: { fontSize: 26, fontWeight: '900', color: '#A78BFA', lineHeight: 30 },
  timerUrgent: { color: '#EF4444' },
  timerTrack: { width: 64, height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, marginTop: 4, overflow: 'hidden' },
  timerBar: { height: '100%', backgroundColor: '#7C3AED', borderRadius: 2 },
  timerBarUrgent: { backgroundColor: '#EF4444' },

  // Score strip
  scoreStrip: { flexDirection: 'row', backgroundColor: '#0F172A', borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(124,58,237,0.15)' },
  scoreItem: { flex: 1, alignItems: 'center' },
  scoreNum: { fontSize: 22, fontWeight: '900', color: '#A78BFA' },
  scoreLabel: { fontSize: 10, color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  scoreDiv: { width: 1, backgroundColor: 'rgba(255,255,255,0.07)' },

  // Word preview
  wordPreview: { backgroundColor: '#0F172A', borderRadius: 14, padding: 14, marginBottom: 12, alignItems: 'center', justifyContent: 'center', minHeight: 52, borderWidth: 1.5, borderColor: 'rgba(124,58,237,0.2)' },
  wordPreviewValid: { borderColor: '#22C55E', backgroundColor: 'rgba(34,197,94,0.08)' },
  wordPreviewInvalid: { borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.08)' },
  wordPreviewDuplicate: { borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.08)' },
  wordPreviewText: { fontSize: 28, fontWeight: '900', color: '#F8FAFC', letterSpacing: 5 },
  wordPreviewValidText: { fontSize: 20, fontWeight: '900', color: '#22C55E', letterSpacing: 3 },
  wordPreviewInvalidText: { fontSize: 18, fontWeight: '800', color: '#EF4444' },
  wordPreviewHint: { fontSize: 13, color: '#475569', fontStyle: 'italic' },

  // Grid
  gridContainer: { alignItems: 'center', marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP, width: TILE_SIZE * GRID_COLS + TILE_GAP * (GRID_COLS - 1) },
  tile: {
    width: TILE_SIZE, height: TILE_SIZE,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden', position: 'relative',
  },
  tileSelected: { borderColor: 'transparent', elevation: 10, shadowColor: '#7C3AED', shadowOpacity: 0.7, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  tileLast: { borderColor: '#A855F7', borderWidth: 2.5 },
  tileAdjacent: { borderColor: 'rgba(124,58,237,0.4)', backgroundColor: 'rgba(124,58,237,0.06)' },
  tileText: { fontSize: 24, fontWeight: '900', color: '#94A3B8' },
  tileTextSelected: { color: '#FFFFFF' },
  tileOrderBadge: { position: 'absolute', top: 4, right: 5, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 6, paddingHorizontal: 3, paddingVertical: 1 },
  tileOrderText: { fontSize: 8, color: '#FFF', fontWeight: '900' },
  adjacentDot: { position: 'absolute', bottom: 6, width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(124,58,237,0.6)' },

  // Actions
  actions: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  clearBtn: { backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.25)' },
  clearBtnText: { color: '#EF4444', fontWeight: '800', fontSize: 14 },
  submitBtn: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  submitBtnDisabled: { opacity: 0.6 },
  submitGradient: { paddingVertical: 14, justifyContent: 'center', alignItems: 'center' },
  submitText: { color: '#FFF', fontWeight: '900', fontSize: 14, letterSpacing: 0.3 },

  // Found words
  foundSection: { },
  foundTitle: { fontSize: 10, color: '#475569', fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 },
  foundScroll: { gap: 6, paddingBottom: 16 },
  foundChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(124,58,237,0.12)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(124,58,237,0.25)' },
  foundWord: { color: '#A78BFA', fontWeight: '800', fontSize: 13 },
  foundScore: { color: '#7C3AED', fontWeight: '900', fontSize: 12 },
});
