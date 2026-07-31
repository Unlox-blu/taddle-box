import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Alert, Dimensions,
  PanResponder,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { HtmlGameResult } from '../../games/types';
import { createGameEngineSocket } from '../../services/socketClient';

const { width } = Dimensions.get('window');
const GRID_COLS = 4;
const TILE_GAP = 8;
const TILE_SIZE = Math.floor((width - 48 - TILE_GAP * (GRID_COLS - 1)) / GRID_COLS);

const E = {
  READY: 'READY', MOVE: 'MOVE',
  CONNECT_ACK: 'CONNECT', START: 'START', SYNC: 'SYNC',
  GAME_OVER: 'GAME_OVER', ERROR: 'ERROR',
};

type Props = {
  matchId: string;
  userId: string;
  wsToken: string;
  onComplete: (result: HtmlGameResult) => void;
};

type FoundWord = { word: string; score: number; userId: string };

export default function WordRushGame({ matchId, userId, wsToken, onComplete }: Props) {
  const [socket, setSocket] = useState<any>(null);
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'active' | 'finished'>('connecting');
  const [grid, setGrid] = useState<string[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [foundWords, setFoundWords] = useState<FoundWord[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState(120);
  const [lastResult, setLastResult] = useState<'valid' | 'invalid' | null>(null);
  const resultAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<any>(null);

  useEffect(() => {
    const s = createGameEngineSocket(matchId, userId, wsToken);
    setSocket(s);

    s.on(E.CONNECT_ACK, (data: any) => {
      const ps = data.state?.pluginState;
      if (ps) applyState(ps);
      s.emit(E.READY);
    });

    s.on(E.START, (data: any) => {
      if (data.state?.pluginState) {
        applyState(data.state.pluginState);
        setStatus('active');
        startLocalTimer(data.state.pluginState.timeLeft ?? 120);
      }
    });

    s.on(E.SYNC, (data: any) => {
      if (!data.state) return;
      applyState(data.state);

      // Flash result feedback
      if (data.result === 'VALID') {
        setLastResult('valid');
        flashResult();
      } else if (data.result === 'INVALID') {
        setLastResult('invalid');
        flashResult();
      }
    });

    s.on(E.GAME_OVER, (data: any) => {
      setStatus('finished');
      clearInterval(timerRef.current);
      const myScore = data.state?.pluginState?.scores?.[userId] || 0;
      const maxScore = Math.max(...Object.values<number>(data.state?.pluginState?.scores || { _: 0 }));
      const won = myScore >= maxScore;
      Alert.alert(won ? '🏆 You Won!' : '😔 Good Try!', `Words found: ${myScore} pts`, [
        { text: 'OK', onPress: () => onComplete({ score: myScore, won, xpEarned: won ? 45 : 10, durationSeconds: 0 }) },
      ]);
    });

    s.on(E.ERROR, (e: any) => Alert.alert('Error', e.message));
    return () => { s.disconnect(); clearInterval(timerRef.current); };
  }, [matchId, userId, wsToken]);

  const applyState = (ps: any) => {
    if (ps.grid) setGrid(ps.grid);
    if (ps.scores) setScores(ps.scores);
    if (ps.foundWords) setFoundWords(ps.foundWords);
    if (ps.timeLeft !== undefined) setTimeLeft(ps.timeLeft);
  };

  const startLocalTimer = (initial: number) => {
    clearInterval(timerRef.current);
    let t = initial;
    timerRef.current = setInterval(() => {
      t -= 1;
      setTimeLeft(t);
      if (t <= 0) clearInterval(timerRef.current);
    }, 1000);
  };

  const flashResult = () => {
    resultAnim.setValue(0);
    Animated.sequence([
      Animated.timing(resultAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(resultAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setLastResult(null));
  };

  // ── Tile interaction ─────────────────────────────────────────────────────
  const onTilePress = useCallback((idx: number) => {
    setSelectedIndices(prev => {
      if (prev.includes(idx)) return prev; // already selected
      return [...prev, idx];
    });
  }, []);

  const submitWord = useCallback(() => {
    if (selectedIndices.length < 2) return;
    socket?.emit(E.MOVE, { type: 'SUBMIT_WORD', indices: selectedIndices });
    setSelectedIndices([]);
  }, [selectedIndices, socket]);

  const clearSelection = useCallback(() => {
    setSelectedIndices([]);
  }, []);

  const selectedWord = selectedIndices.map(i => grid[i] || '').join('');
  const myScore = scores[userId] || 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Word Rush</Text>
          <Text style={styles.subtitle}>Swipe letters to form words</Text>
        </View>
        <View style={styles.timerBox}>
          <Text style={[styles.timerText, timeLeft <= 15 && styles.timerUrgent]}>{timeLeft}s</Text>
        </View>
      </View>

      {/* Score */}
      <View style={styles.scoreRow}>
        <Text style={styles.scoreLabel}>Your Score</Text>
        <Text style={styles.scoreValue}>{myScore} pts</Text>
      </View>

      {/* Word preview */}
      <Animated.View style={[
        styles.wordPreview,
        lastResult === 'valid' && styles.wordPreviewValid,
        lastResult === 'invalid' && styles.wordPreviewInvalid,
        { opacity: selectedWord.length > 0 || lastResult ? 1 : 0.3 },
      ]}>
        <Text style={styles.wordPreviewText}>
          {selectedWord.length > 0 ? selectedWord.toUpperCase() : 'Select letters'}
        </Text>
        {lastResult === 'valid' && <Text style={styles.resultBadge}>✅ Valid!</Text>}
        {lastResult === 'invalid' && <Text style={[styles.resultBadge, styles.resultBadgeInvalid]}>❌ Not a word</Text>}
      </Animated.View>

      {/* 4×4 Grid */}
      <View style={styles.grid}>
        {(grid.length > 0 ? grid : Array(16).fill('?')).map((letter, idx) => {
          const isSelected = selectedIndices.includes(idx);
          const selOrder = selectedIndices.indexOf(idx);
          return (
            <TouchableOpacity
              key={idx}
              onPress={() => onTilePress(idx)}
              activeOpacity={0.75}
              style={[styles.tile, isSelected && styles.tileSelected]}
            >
              {isSelected && (
                <LinearGradient colors={['#7C3AED', '#0891B2']} style={StyleSheet.absoluteFill} />
              )}
              <Text style={[styles.tileText, isSelected && styles.tileTextSelected]}>
                {letter.toUpperCase()}
              </Text>
              {isSelected && (
                <Text style={styles.tileOrder}>{selOrder + 1}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.clearBtn} onPress={clearSelection}>
          <Text style={styles.clearBtnText}>✕ Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitBtn, selectedIndices.length < 2 && styles.submitBtnDisabled]}
          onPress={submitWord}
          disabled={selectedIndices.length < 2}
        >
          <LinearGradient colors={['#7C3AED', '#0891B2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitBtnGradient}>
            <Text style={styles.submitBtnText}>Submit Word →</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Found words list */}
      <View style={styles.foundSection}>
        <Text style={styles.foundTitle}>Found Words</Text>
        <View style={styles.foundWordsList}>
          {foundWords.filter(w => w.userId === userId).slice(-10).map((fw, i) => (
            <View key={i} style={styles.foundWordChip}>
              <Text style={styles.foundWordText}>{fw.word}</Text>
              <Text style={styles.foundWordScore}>+{fw.score}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05050F', padding: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '900', color: '#F8FAFC' },
  subtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  timerBox: { backgroundColor: '#1E293B', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: 'rgba(124,58,237,0.5)' },
  timerText: { fontSize: 22, fontWeight: '900', color: '#A78BFA' },
  timerUrgent: { color: '#EF4444' },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, backgroundColor: '#0F172A', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: 'rgba(124,58,237,0.2)' },
  scoreLabel: { color: '#64748B', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  scoreValue: { color: '#A78BFA', fontSize: 22, fontWeight: '900' },
  wordPreview: { backgroundColor: '#0F172A', borderRadius: 12, padding: 14, marginBottom: 14, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(124,58,237,0.25)', minHeight: 56, justifyContent: 'center', flexDirection: 'row', gap: 10 },
  wordPreviewValid: { borderColor: '#22C55E', backgroundColor: 'rgba(34,197,94,0.08)' },
  wordPreviewInvalid: { borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.08)' },
  wordPreviewText: { fontSize: 26, fontWeight: '900', color: '#F8FAFC', letterSpacing: 4 },
  resultBadge: { fontSize: 14, color: '#22C55E', fontWeight: '700' },
  resultBadgeInvalid: { color: '#EF4444' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP, justifyContent: 'center', marginBottom: 16 },
  tile: { width: TILE_SIZE, height: TILE_SIZE, backgroundColor: '#1E293B', borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', position: 'relative' },
  tileSelected: { borderColor: 'transparent', elevation: 8, shadowColor: '#7C3AED', shadowOpacity: 0.6, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  tileText: { fontSize: 22, fontWeight: '900', color: '#CBD5E1' },
  tileTextSelected: { color: '#FFFFFF' },
  tileOrder: { position: 'absolute', top: 4, right: 6, fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  clearBtn: { backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14, borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.35)', justifyContent: 'center' },
  clearBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 14 },
  submitBtn: { flex: 1 },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnGradient: { height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  submitBtnText: { color: '#FFF', fontWeight: '900', fontSize: 15 },
  foundSection: { flex: 1 },
  foundTitle: { fontSize: 11, color: '#64748B', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  foundWordsList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  foundWordChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(124,58,237,0.15)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(124,58,237,0.3)' },
  foundWordText: { color: '#A78BFA', fontWeight: '700', fontSize: 13 },
  foundWordScore: { color: '#7C3AED', fontWeight: '900', fontSize: 12 },
});
