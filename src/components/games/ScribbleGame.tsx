import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Alert,
  Dimensions, PanResponder, FlatList, KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { HtmlGameResult } from '../../games/types';
import { createGameEngineSocket } from '../../services/socketClient';

const { width, height } = Dimensions.get('window');
const CANVAS_W = width - 24;
const CANVAS_H = height * 0.38;

const E = {
  READY: 'READY', MOVE: 'MOVE',
  CONNECT_ACK: 'CONNECT', START: 'START', SYNC: 'SYNC',
  GAME_OVER: 'GAME_OVER', ERROR: 'ERROR',
};

type Stroke = { points: { x: number; y: number }[]; color: string; width: number };
type ChatMsg = { userId: string; text: string; correct?: boolean; ts: number };

type Props = {
  matchId: string;
  userId: string;
  wsToken: string;
  onComplete: (result: HtmlGameResult) => void;
};

export default function ScribbleGame({ matchId, userId, wsToken, onComplete }: Props) {
  const [socket, setSocket] = useState<any>(null);
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'drawing' | 'guessing' | 'finished'>('connecting');
  const [isDrawer, setIsDrawer] = useState(false);
  const [word, setWord] = useState<string | null>(null);         // Only known to drawer
  const [wordMask, setWordMask] = useState<string | null>(null); // Underscores for guessers
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[]>([]);
  const [penColor, setPenColor] = useState('#FFFFFF');
  const [penWidth, setPenWidth] = useState(4);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [guess, setGuess] = useState('');
  const [timeLeft, setTimeLeft] = useState(90);
  const [round, setRound] = useState(1);
  const [scores, setScores] = useState<Record<string, number>>({});
  const flatRef = useRef<FlatList>(null);
  const canvasRef = useRef<View>(null);
  const canvasOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const s = createGameEngineSocket(matchId, userId, wsToken);
    setSocket(s);

    s.on(E.CONNECT_ACK, (data: any) => {
      const ps = data.state?.pluginState;
      if (ps) applyState(ps);
      s.emit(E.READY);
    });

    s.on(E.START, (data: any) => {
      if (data.state?.pluginState) applyState(data.state.pluginState);
    });

    s.on(E.SYNC, (data: any) => {
      if (!data.state) return;
      applyState(data.state);
    });

    s.on(E.GAME_OVER, (data: any) => {
      setStatus('finished');
      const myScore = data.state?.pluginState?.scores?.[userId] || 0;
      const maxScore = Math.max(...Object.values<number>(data.state?.pluginState?.scores || {}));
      const won = myScore >= maxScore;
      Alert.alert(won ? '🎨 You Won!' : '😔 Good Try!', `Your score: ${myScore}`, [
        { text: 'OK', onPress: () => onComplete({ score: myScore, won, xpEarned: won ? 50 : 10, durationSeconds: 0 }) },
      ]);
    });

    s.on(E.ERROR, (e: any) => Alert.alert('Error', e.message));
    return () => s.disconnect();
  }, [matchId, userId, wsToken]);

  const applyState = (ps: any) => {
    if (ps.drawerId === userId) {
      setIsDrawer(true);
      setStatus('drawing');
      setWord(ps.word);
    } else {
      setIsDrawer(false);
      setStatus('guessing');
      setWordMask(ps.wordMask);
    }
    if (ps.strokes) setStrokes(ps.strokes);
    if (ps.round) setRound(ps.round);
    if (ps.timeLeft !== undefined) setTimeLeft(ps.timeLeft);
    if (ps.scores) setScores(ps.scores);
    if (ps.guesses) {
      setChat(ps.guesses.map((g: any) => ({
        userId: g.userId,
        text: g.text,
        correct: g.correct,
        ts: g.ts || Date.now(),
      })));
    }
  };

  // ── Drawing PanResponder ─────────────────────────────────────────────────
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => isDrawer,
    onMoveShouldSetPanResponder: () => isDrawer,

    onPanResponderGrant: (evt) => {
      const x = evt.nativeEvent.locationX;
      const y = evt.nativeEvent.locationY;
      setCurrentStroke([{ x, y }]);
    },

    onPanResponderMove: (evt) => {
      const x = evt.nativeEvent.locationX;
      const y = evt.nativeEvent.locationY;
      setCurrentStroke(prev => {
        const updated = [...prev, { x, y }];
        // Throttle: emit every 8 points
        if (updated.length % 8 === 0) {
          socket?.emit(E.MOVE, { type: 'STROKE_CHUNK', points: updated.slice(-8), color: penColor, width: penWidth });
        }
        return updated;
      });
    },

    onPanResponderRelease: () => {
      if (currentStroke.length > 0) {
        const newStroke: Stroke = { points: currentStroke, color: penColor, width: penWidth };
        socket?.emit(E.MOVE, { type: 'STROKE_END', stroke: newStroke });
        setStrokes(prev => [...prev, newStroke]);
        setCurrentStroke([]);
      }
    },
  });

  const clearCanvas = useCallback(() => {
    if (!isDrawer) return;
    setStrokes([]);
    setCurrentStroke([]);
    socket?.emit(E.MOVE, { type: 'CLEAR' });
  }, [isDrawer, socket]);

  const submitGuess = useCallback(() => {
    if (!guess.trim() || isDrawer) return;
    socket?.emit(E.MOVE, { type: 'GUESS', text: guess.trim() });
    setGuess('');
  }, [guess, isDrawer, socket]);

  const renderCanvas = () => (
    <View
      ref={canvasRef}
      style={styles.canvas}
      {...panResponder.panHandlers}
    >
      {/* SVG-like stroke rendering using nested Views */}
      {[...strokes, currentStroke.length > 1 ? { points: currentStroke, color: penColor, width: penWidth } : null]
        .filter(Boolean)
        .map((stroke: any, si) =>
          stroke.points.slice(0, -1).map((_: any, pi: number) => {
            const p1 = stroke.points[pi];
            const p2 = stroke.points[pi + 1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            return (
              <View
                key={`${si}-${pi}`}
                style={{
                  position: 'absolute',
                  left: p1.x,
                  top: p1.y - stroke.width / 2,
                  width: len,
                  height: stroke.width,
                  backgroundColor: stroke.color,
                  borderRadius: stroke.width / 2,
                  transform: [{ rotate: `${angle}deg` }, { translateX: 0 }],
                  transformOrigin: '0 50%' as any,
                }}
              />
            );
          })
        )}
      {!isDrawer && strokes.length === 0 && (
        <Text style={styles.canvasHint}>Waiting for drawer…</Text>
      )}
    </View>
  );

  const COLORS_PALETTE = ['#FFFFFF', '#EF4444', '#22C55E', '#3B82F6', '#EAB308', '#A855F7', '#EC4899', '#000000'];
  const WIDTHS = [2, 4, 8, 14];

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.roundLabel}>Round {round}</Text>
          <Text style={styles.wordDisplay}>
            {isDrawer ? word : (wordMask ?? '_ _ _ _ _')}
          </Text>
        </View>
        <View style={styles.timerBox}>
          <Text style={[styles.timerText, timeLeft <= 10 && styles.timerUrgent]}>{timeLeft}s</Text>
        </View>
      </View>

      {/* Canvas */}
      {renderCanvas()}

      {/* Drawer tools */}
      {isDrawer && (
        <View style={styles.tools}>
          <View style={styles.palette}>
            {COLORS_PALETTE.map(c => (
              <TouchableOpacity key={c} onPress={() => setPenColor(c)} style={[styles.colorDot, { backgroundColor: c, borderWidth: penColor === c ? 3 : 1 }]} />
            ))}
          </View>
          <View style={styles.widthRow}>
            {WIDTHS.map(w => (
              <TouchableOpacity key={w} onPress={() => setPenWidth(w)} style={[styles.widthBtn, penWidth === w && styles.widthBtnActive]}>
                <View style={{ width: w + 4, height: w + 4, borderRadius: (w + 4) / 2, backgroundColor: penColor }} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={clearCanvas} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>✕ Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Chat / Guesses */}
      <FlatList
        ref={flatRef}
        data={chat}
        keyExtractor={(_, i) => String(i)}
        style={styles.chat}
        onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <Text style={[styles.chatMsg, item.correct && styles.chatCorrect]}>
            {item.correct ? '✅ ' : ''}{item.text}
          </Text>
        )}
      />

      {/* Guess input */}
      {!isDrawer && (
        <View style={styles.guessRow}>
          <TextInput
            style={styles.guessInput}
            value={guess}
            onChangeText={setGuess}
            placeholder="Type your guess…"
            placeholderTextColor="#64748B"
            returnKeyType="send"
            onSubmitEditing={submitGuess}
            autoCorrect={false}
          />
          <TouchableOpacity onPress={submitGuess}>
            <LinearGradient colors={['#7C3AED', '#0891B2']} style={styles.sendBtn}>
              <Text style={styles.sendBtnText}>→</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05050F', padding: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  headerLeft: { flex: 1 },
  roundLabel: { fontSize: 11, color: '#64748B', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  wordDisplay: { fontSize: 20, color: '#F8FAFC', fontWeight: '900', letterSpacing: 4, marginTop: 2 },
  timerBox: { backgroundColor: '#1E293B', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: 'rgba(124,58,237,0.5)' },
  timerText: { fontSize: 20, fontWeight: '900', color: '#A78BFA' },
  timerUrgent: { color: '#EF4444' },
  canvas: { width: CANVAS_W, height: CANVAS_H, backgroundColor: '#0F172A', borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(124,58,237,0.3)', overflow: 'hidden', position: 'relative', justifyContent: 'center', alignItems: 'center' },
  canvasHint: { color: '#475569', fontSize: 14 },
  tools: { marginTop: 8 },
  palette: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 6 },
  colorDot: { width: 28, height: 28, borderRadius: 14, borderColor: '#FFF' },
  widthRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  widthBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  widthBtnActive: { borderColor: '#7C3AED', backgroundColor: 'rgba(124,58,237,0.2)' },
  clearBtn: { marginLeft: 'auto' as any, backgroundColor: 'rgba(239,68,68,0.2)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)' },
  clearBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 13 },
  chat: { flex: 1, marginTop: 10, paddingHorizontal: 2 },
  chatMsg: { color: '#94A3B8', fontSize: 13, paddingVertical: 2 },
  chatCorrect: { color: '#22C55E', fontWeight: '700', fontSize: 14 },
  guessRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  guessInput: { flex: 1, backgroundColor: '#1E293B', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, color: '#F8FAFC', fontSize: 15, borderWidth: 1, borderColor: 'rgba(124,58,237,0.3)' },
  sendBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  sendBtnText: { color: '#FFF', fontSize: 20, fontWeight: '900' },
});
