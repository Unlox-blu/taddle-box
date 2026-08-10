import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, 
  Dimensions, PanResponder, FlatList, KeyboardAvoidingView, Platform, Animated, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { HtmlGameResult } from '../../games/types';
import { createGameEngineSocket } from '../../services/socketClient';
import { gameSound } from '../../services/gameSound';
import { themedAlert } from '../common/ThemedAlert';

const { width, height } = Dimensions.get('window');
const CANVAS_W = width - 24;
const CANVAS_H = height * 0.36;

const E = {
  READY: 'READY', MOVE: 'MOVE',
  CONNECT_ACK: 'CONNECT', START: 'START', SYNC: 'SYNC',
  GAME_OVER: 'GAME_OVER', ERROR: 'ERROR', PAUSE: 'PAUSE',
};

type Stroke = { points: { x: number; y: number }[]; color: string; width: number };
type ChatMsg = { userId: string; text: string; correct?: boolean; ts: number };

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
  /** Mirrors the GamePlayModal phase — the round clock only ticks once the
      3-2-1 countdown finishes, so the countdown never burns round time. */
  externalPhase?: "playing" | "waiting";
  onComplete: (result: HtmlGameResult) => void;
};

const COLORS_PALETTE = ['#FFFFFF', '#EF4444', '#22C55E', '#3B82F6', '#EAB308', '#A855F7', '#EC4899', '#000000'];
const WIDTHS = [3, 6, 10, 16];

export default function ScribbleGame({ matchId, userId, wsToken, players, externalPhase = "waiting", onComplete }: Props) {
  const [socket, setSocket] = useState<any>(null);
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'drawing' | 'guessing' | 'finished'>('connecting');
  const [isDrawer, setIsDrawer] = useState(false);
  const [word, setWord] = useState<string | null>(null);
  const [wordMask, setWordMask] = useState<string | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[]>([]);
  const [penColor, setPenColor] = useState('#FFFFFF');
  const [penWidth, setPenWidth] = useState(6);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [guess, setGuess] = useState('');
  const [timeLeft, setTimeLeft] = useState(90);
  const [round, setRound] = useState(1);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [showRoleCard, setShowRoleCard] = useState(false);

  const flatRef = useRef<FlatList>(null);
  const timerRef = useRef<any>(null);
  const externalPhaseRef = useRef(externalPhase);
  useEffect(() => { externalPhaseRef.current = externalPhase; }, [externalPhase]);
  // Latest plugin state (for re-syncing the round clock when the board becomes
  // visible after the 3-2-1 countdown).
  const lastPsRef = useRef<any>(null);
  const roleAnim = useRef(new Animated.Value(0)).current;
  const timerBarAnim = useRef(new Animated.Value(1)).current;
  // Mirrors `currentStroke` but is updated synchronously inside the PanResponder,
  // so onPanResponderRelease never reads a stale snapshot (which used to drop
  // the tail of fast strokes).
  const currentStrokeRef = useRef<{ x: number; y: number }[]>([]);
  const isDrawerRef = useRef(false);
  isDrawerRef.current = isDrawer;
  const socketRef = useRef<any>(null);
  socketRef.current = socket;
  const penColorRef = useRef(penColor);
  penColorRef.current = penColor;
  const penWidthRef = useRef(penWidth);
  penWidthRef.current = penWidth;
  // The engine fires START only after every player's board is visible — READY
  // is sent once the 3-2-1 countdown finishes, never on connect, so the round
  // clock + draw time never start behind the countdown.
  const readySentRef = useRef(false);
  // Bumped on every CONNECT_ACK so a reconnect during the waiting phase
  // re-arms READY (the server drops the player from readyPlayers on
  // disconnect — without re-sending, the match would never start).
  const [readyTick, setReadyTick] = useState(0);
  // Mirrors `guess` so submitGuess can read the freshest draft synchronously
  // (a fast Enter + state race used to submit a stale/empty value).
  const guessRef = useRef('');
  guessRef.current = guess;

  // Show role announcement card — cue the player their turn/role changed
  const announceRole = (drawing: boolean) => {
    gameSound.playTurn();
    setShowRoleCard(true);
    roleAnim.setValue(0);
    Animated.sequence([
      Animated.spring(roleAnim, { toValue: 1, useNativeDriver: true, speed: 12 }),
      Animated.delay(2000),
      Animated.timing(roleAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setShowRoleCard(false));
  };

  useEffect(() => {
    const s = createGameEngineSocket(matchId, userId, wsToken);
    setSocket(s);

    s.on(E.CONNECT_ACK, (data: any) => {
      const ps = data.state?.pluginState;
      const matchStatus = data.state?.status;
      if (ps) applyState(ps, false);
      if (matchStatus === 'ACTIVE') {
        setStatus(ps?.drawerId === userId ? 'drawing' : 'guessing');
      } else {
        setStatus('waiting');
      }
      // Reconnect (or fresh join) — re-arm the READY gate.
      readySentRef.current = false;
      setReadyTick((t) => t + 1);
    });

    s.on(E.START, (data: any) => {
      const ps = data.state?.pluginState ?? data.state;
      if (ps) applyState(ps, true);
    });

    s.on(E.SYNC, (data: any) => {
      // Stroke streaming from other players
      if (data.type === 'STROKE_CHUNK') {
        if (data.userId !== userId) {
          setCurrentStroke(prev => [...prev, ...(data.points || [])]);
        }
        return;
      }
      if (data.type === 'STROKE_END') {
        if (data.userId !== userId && data.stroke) {
          setStrokes(prev => [...prev, data.stroke]);
          setCurrentStroke([]);
        }
        return;
      }
      if (data.type === 'CLEAR') {
        if (data.userId !== userId) {
          setStrokes([]);
          setCurrentStroke([]);
        }
        return;
      }
      // Regular state sync
      if (!data.state) return;
      applyState(data.state, false);
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
        won ? '🎨 You Won!' : '😔 Good Try!',
        `Your score: ${myScore} pts`,
        [{ text: 'OK', onPress: () => onComplete({ score: myScore, won, xpEarned: won ? 50 : 10, durationSeconds: 0 }) }]
      );
    });

    s.on(E.ERROR, (e: any) => {
      // Guess errors are expected (wrong word) — just show in chat
      const msg = e.message || '';
      if (msg.includes('Incorrect') || msg.includes('wrong') || msg.includes('not correct')) {
        // silently ignore — chat will reflect
      } else {
        themedAlert('Error', msg);
      }
    });

    s.on(E.PAUSE, () => {
      clearInterval(timerRef.current);
      timerBarAnim.stopAnimation();
    });

    return () => { s.disconnect(); clearInterval(timerRef.current); };
  }, [matchId, userId, wsToken]);

  // Send READY the moment the board is actually visible (after the 3-2-1).
  useEffect(() => {
    if (externalPhase !== 'playing' || readySentRef.current || !socket) return;
    readySentRef.current = true;
    socket.emit(E.READY);
  }, [externalPhase, socket, readyTick]);

  const applyState = (ps: any, announce: boolean) => {
    lastPsRef.current = ps;
    // drawerId comes from server _getPlayerState helper
    const drawerId = ps.drawerId;
    const drawing = drawerId === userId;
    setIsDrawer(drawing);

    if (announce) {
      announceRole(drawing);
      setStatus(drawing ? 'drawing' : 'guessing');
    }

    if (drawing) {
      setStatus('drawing');
      // drawer gets `word` field
      if (ps.word) setWord(ps.word);
    } else {
      setStatus('guessing');
      if (ps.wordMask !== undefined) setWordMask(ps.wordMask);
    }

    if (ps.strokes) setStrokes(ps.strokes);
    if (ps.currentRound) setRound(ps.currentRound);
    if (ps.scores) setScores(ps.scores);

    if (ps.guesses) {
      setChat(ps.guesses.map((g: any) => ({
        userId: g.userId,
        text: g.text,
        correct: g.correct,
        ts: g.ts || Date.now(),
      })));
    }

    // Timer — only start it while the board is visible (fresh matches fire
    // START during the countdown, so the effect below kicks the clock off once
    // the board is actually shown).
    if (externalPhaseRef.current === 'playing') {
      startTimerFromState(ps);
    }
  };

  // Start the round clock the moment the 3-2-1 countdown finishes.
  useEffect(() => {
    if (externalPhase !== 'playing') return;
    if (status === 'connecting' || status === 'waiting' || status === 'finished') return;
    startTimerFromState(lastPsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalPhase]);

  const startTimerFromState = (ps: any) => {
    if (ps?.roundStartedAt) {
      const elapsed = Math.floor((Date.now() - ps.roundStartedAt) / 1000);
      const roundDurationSec = ps.roundDurationMs ? Math.floor(ps.roundDurationMs / 1000) : 80;
      startTimer(Math.max(0, roundDurationSec - elapsed));
    } else {
      startTimer(80);
    }
  };

  const startTimer = (total: number) => {
    clearInterval(timerRef.current);
    setTimeLeft(total);
    timerBarAnim.setValue(1);
    Animated.timing(timerBarAnim, {
      toValue: 0, duration: total * 1000, useNativeDriver: false,
    }).start();
    let t = total;
    timerRef.current = setInterval(() => {
      t -= 1;
      setTimeLeft(t);
      if (t <= 0) clearInterval(timerRef.current);
    }, 1000);
  };

  // ── Drawing ────────────────────────────────────────────────────────────────
  // Stroke points are tracked in a ref so release/terminate handlers see the
  // complete stroke even during fast drawing (state reads were stale and
  // dropped the final chunks). The socket emit happens outside the state
  // updater to avoid double-firing in React 18+ concurrent rendering.
  const finishStroke = () => {
    const pts = currentStrokeRef.current;
    if (pts.length > 1) {
      const newStroke: Stroke = {
        points: pts,
        color: penColorRef.current,
        width: penWidthRef.current,
      };
      socketRef.current?.emit(E.MOVE, { type: 'STROKE_END', stroke: newStroke });
      setStrokes(prev => [...prev, newStroke]);
    }
    currentStrokeRef.current = [];
    setCurrentStroke([]);
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => isDrawerRef.current,
    onMoveShouldSetPanResponder: () => isDrawerRef.current,

    onPanResponderGrant: (evt) => {
      const { locationX: x, locationY: y } = evt.nativeEvent;
      currentStrokeRef.current = [{ x, y }];
      setCurrentStroke([{ x, y }]);
    },

    onPanResponderMove: (evt) => {
      const { locationX: x, locationY: y } = evt.nativeEvent;
      currentStrokeRef.current = [...currentStrokeRef.current, { x, y }];
      setCurrentStroke(currentStrokeRef.current);
      if (currentStrokeRef.current.length % 6 === 0) {
        socketRef.current?.emit(E.MOVE, {
          type: 'STROKE_CHUNK',
          points: currentStrokeRef.current.slice(-6),
          color: penColorRef.current,
          width: penWidthRef.current,
        });
      }
    },

    onPanResponderRelease: finishStroke,
    onPanResponderTerminate: finishStroke,
  });

  const clearCanvas = useCallback(() => {
    if (!isDrawerRef.current) return;
    setStrokes([]);
    currentStrokeRef.current = [];
    setCurrentStroke([]);
    socketRef.current?.emit(E.MOVE, { type: 'CLEAR' });
  }, []);

  const submitGuess = useCallback(() => {
    if (isDrawer) return;
    const draft = guessRef.current.trim();
    if (!draft || !socket) return;
    socket.emit(E.MOVE, { type: 'GUESS', text: draft });
    // Optimistic echo — the server SYNCs the authoritative feed back.
    setChat(prev => [...prev, { userId, text: draft, correct: false, ts: Date.now() }]);
    setGuess('');
    guessRef.current = '';
    gameSound.playTap();
  }, [isDrawer, socket, userId]);

  // ── Canvas stroke rendering ──────────────────────────────────────────────
  const renderStrokes = (strokeList: Stroke[], liveStroke: { x: number; y: number }[]) => {
    const all = [
      ...strokeList,
      liveStroke.length > 1 ? { points: liveStroke, color: penColor, width: penWidth } : null,
    ].filter(Boolean) as Stroke[];

    return all.flatMap((stroke, si) =>
      stroke.points.slice(0, -1).map((p1, pi) => {
        const p2 = stroke.points[pi + 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        if (len < 0.5) return null;
        return (
          <View
            key={`${si}-${pi}`}
            style={{
              position: 'absolute',
              left: p1.x,
              top: p1.y - stroke.width / 2,
              width: len + stroke.width / 2,
              height: stroke.width,
              backgroundColor: stroke.color,
              borderRadius: stroke.width / 2,
              transformOrigin: '0 50%' as any,
              transform: [{ rotate: `${angle}deg` }],
            }}
          />
        );
      })
    ).filter(Boolean);
  };

  // ── Loading/waiting states ────────────────────────────────────────────────
  if (status === 'connecting') {
    return (
      <View style={styles.fullCenter}>
        <Text style={styles.splashIcon}>✏️</Text>
        <Text style={styles.splashTitle}>Scribble</Text>
        <Text style={styles.splashSub}>Connecting…</Text>
      </View>
    );
  }

  if (status === 'waiting') {
    return (
      <View style={styles.fullCenter}>
        <Text style={styles.splashIcon}>⏳</Text>
        <Text style={styles.splashTitle}>Scribble</Text>
        <Text style={styles.splashSub}>Waiting for players…</Text>
        <View style={styles.dotRow}>
          {[0,1,2].map(i => <WaitDot key={i} delay={i * 200} />)}
        </View>
      </View>
    );
  }

  const myScore = scores[userId] || 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}
    >
      {/* Role announcement overlay */}
      {showRoleCard && (
        <Animated.View style={[
          styles.roleOverlay,
          { opacity: roleAnim, transform: [{ scale: roleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] },
        ]}>
          <Text style={styles.roleIcon}>{isDrawer ? '🎨' : '🔍'}</Text>
          <Text style={styles.roleTitle}>{isDrawer ? 'You are Drawing!' : 'You are Guessing!'}</Text>
          <Text style={styles.roleSub}>{isDrawer ? 'Draw the word for others to guess' : 'Type your guess below'}</Text>
        </Animated.View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.roundBadge}>
            <Text style={styles.roundLabel}>ROUND {round}</Text>
          </View>
          <Text style={styles.wordDisplay}>
            {isDrawer
              ? word?.toUpperCase() || '...'
              : (wordMask?.toUpperCase() ?? '_ _ _ _ _')}
          </Text>
        </View>
        <View style={styles.timerBox}>
          <Text style={[styles.timerText, timeLeft <= 10 && styles.timerUrgent]}>{timeLeft}s</Text>
          <View style={styles.timerTrack}>
            <Animated.View style={[
              styles.timerBar,
              { width: timerBarAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
              timeLeft <= 10 && styles.timerBarUrgent,
            ]} />
          </View>
        </View>
      </View>

      {/* Score row */}
      <View style={styles.scoreRow}>
        <View style={styles.rolePill}>
          <Text style={styles.rolePillText}>{isDrawer ? '🎨 Drawing' : '🔍 Guessing'}</Text>
        </View>
        <Text style={styles.scorePill}>⭐ {myScore} pts</Text>
      </View>

      {/* Canvas */}
      <View style={styles.canvas} {...panResponder.panHandlers}>
        {renderStrokes(strokes, currentStroke)}
        {!isDrawer && strokes.length === 0 && (
          <View style={styles.canvasEmpty}>
            <Text style={styles.canvasEmptyIcon}>✏️</Text>
            <Text style={styles.canvasEmptyText}>Waiting for drawer to start…</Text>
          </View>
        )}
        {isDrawer && strokes.length === 0 && currentStroke.length === 0 && (
          <Text style={styles.canvasHint}>Draw here! 👆</Text>
        )}
      </View>

      {/* Drawer toolbar */}
      {isDrawer && (
        <View style={styles.toolbar}>
          <View style={styles.palette}>
            {COLORS_PALETTE.map(c => (
              <TouchableOpacity
                key={c}
                onPress={() => setPenColor(c)}
                style={[
                  styles.colorDot,
                  { backgroundColor: c },
                  penColor === c && styles.colorDotActive,
                  c === '#000000' && { borderColor: '#FFF' },
                ]}
              />
            ))}
          </View>
          <View style={styles.toolRow}>
            {WIDTHS.map(w => (
              <TouchableOpacity
                key={w}
                onPress={() => setPenWidth(w)}
                style={[styles.widthBtn, penWidth === w && styles.widthBtnActive]}
              >
                <View style={{ width: w + 2, height: w + 2, borderRadius: (w + 2) / 2, backgroundColor: penColor }} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={clearCanvas} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>✕ Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Chat feed */}
      <FlatList
        ref={flatRef}
        data={chat}
        keyExtractor={(_, i) => String(i)}
        style={styles.chat}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          !isDrawer ? <Text style={styles.chatEmpty}>No guesses yet… be first!</Text> : null
        }
        renderItem={({ item }) => (
          <View style={[styles.chatRow, item.correct && styles.chatRowCorrect]}>
            {item.correct && <Text style={styles.chatCheckmark}>✅</Text>}
            <Text style={[styles.chatMsg, item.correct && styles.chatCorrect]}>
              {item.correct ? `Correct! "${item.text}"` : item.text}
            </Text>
          </View>
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
            placeholderTextColor="#475569"
            returnKeyType="send"
            onSubmitEditing={submitGuess}
            blurOnSubmit={false}
            autoCorrect={false}
            autoCapitalize="none"
            maxLength={40}
            enablesReturnKeyAutomatically
          />
          <TouchableOpacity onPress={submitGuess} disabled={!guess.trim()}>
            <LinearGradient
              colors={guess.trim() ? ['#7C3AED', '#0891B2'] : ['#1E293B', '#1E293B']}
              style={styles.sendBtn}
            >
              <Text style={styles.sendBtnText}>→</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

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
  return <Animated.View style={[styles.dot, { opacity: anim }]} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05050F', padding: 12 },
  fullCenter: { flex: 1, backgroundColor: '#05050F', justifyContent: 'center', alignItems: 'center' },
  splashIcon: { fontSize: 64, marginBottom: 16 },
  splashTitle: { fontSize: 26, fontWeight: '900', color: '#F8FAFC', marginBottom: 8 },
  splashSub: { fontSize: 14, color: '#64748B', marginBottom: 20 },
  dotRow: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#7C3AED' },

  roleOverlay: {
    position: 'absolute', inset: 0, zIndex: 100,
    backgroundColor: 'rgba(5,5,15,0.92)',
    justifyContent: 'center', alignItems: 'center',
  },
  roleIcon: { fontSize: 72, marginBottom: 16 },
  roleTitle: { fontSize: 28, fontWeight: '900', color: '#F8FAFC', textAlign: 'center', marginBottom: 8 },
  roleSub: { fontSize: 15, color: '#94A3B8', textAlign: 'center', paddingHorizontal: 32 },

  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  headerLeft: { flex: 1 },
  roundBadge: { flexDirection: 'row', marginBottom: 4 },
  roundLabel: { fontSize: 10, color: '#7C3AED', fontWeight: '800', letterSpacing: 1.5, backgroundColor: 'rgba(124,58,237,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  wordDisplay: { fontSize: 20, color: '#F8FAFC', fontWeight: '900', letterSpacing: 5, marginTop: 4 },
  timerBox: { alignItems: 'flex-end' },
  timerText: { fontSize: 24, fontWeight: '900', color: '#A78BFA' },
  timerUrgent: { color: '#EF4444' },
  timerTrack: { width: 60, height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, marginTop: 4, overflow: 'hidden' },
  timerBar: { height: '100%', backgroundColor: '#7C3AED', borderRadius: 2 },
  timerBarUrgent: { backgroundColor: '#EF4444' },

  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  rolePill: { backgroundColor: 'rgba(124,58,237,0.12)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(124,58,237,0.25)' },
  rolePillText: { color: '#A78BFA', fontSize: 12, fontWeight: '800' },
  scorePill: { color: '#F8FAFC', fontSize: 13, fontWeight: '800' },

  canvas: { width: CANVAS_W, height: CANVAS_H, backgroundColor: '#0F172A', borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(124,58,237,0.25)', overflow: 'hidden', position: 'relative', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  canvasEmpty: { alignItems: 'center', gap: 8 },
  canvasEmptyIcon: { fontSize: 32, opacity: 0.4 },
  canvasEmptyText: { color: '#334155', fontSize: 13, fontStyle: 'italic' },
  canvasHint: { color: '#334155', fontSize: 13, fontStyle: 'italic' },

  toolbar: { marginBottom: 6 },
  palette: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 6 },
  colorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)' },
  colorDotActive: { borderWidth: 3, borderColor: '#FFF', transform: [{ scale: 1.15 }] },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  widthBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  widthBtnActive: { borderColor: '#7C3AED', backgroundColor: 'rgba(124,58,237,0.2)' },
  clearBtn: { marginLeft: 'auto' as any, backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)' },
  clearBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 12 },

  chat: { flex: 1, marginTop: 4, paddingHorizontal: 2 },
  chatEmpty: { color: '#334155', fontSize: 13, textAlign: 'center', paddingVertical: 12, fontStyle: 'italic' },
  chatRow: { paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chatRowCorrect: { backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: 8, paddingHorizontal: 8 },
  chatCheckmark: { fontSize: 13 },
  chatMsg: { color: '#94A3B8', fontSize: 13, flex: 1 },
  chatCorrect: { color: '#22C55E', fontWeight: '700', fontSize: 14 },

  guessRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  guessInput: { flex: 1, backgroundColor: '#1E293B', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, color: '#F8FAFC', fontSize: 15, borderWidth: 1.5, borderColor: 'rgba(124,58,237,0.25)' },
  sendBtn: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  sendBtnText: { color: '#FFF', fontSize: 22, fontWeight: '900' },
});
