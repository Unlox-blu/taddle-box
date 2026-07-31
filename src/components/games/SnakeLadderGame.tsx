import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Line, Circle, Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import type { HtmlGameResult } from '../../games/types';
import { createGameEngineSocket } from '../../services/socketClient';

const { width } = Dimensions.get('window');
const BOARD_SIZE = Math.min(Math.floor(width - 16), 400);
const GRID = 10;
const CELL = BOARD_SIZE / GRID;

// ── Board data ──────────────────────────────────────────────────────────────
const SNAKES: Record<number, number> = { 99: 54, 70: 55, 52: 42, 43: 22, 36: 6, 32: 10, 49: 11 };
const LADDERS: Record<number, number> = { 4: 25, 13: 46, 33: 49, 42: 63, 50: 69, 62: 81, 74: 92 };


const PLAYER_COLORS = ['#7C3AED', '#EF4444', '#22C55E', '#EAB308'];

// Convert square (1-100) to {row, col} from top-left (screen coords)
function squareToGrid(sq: number): { row: number; col: number } {
  const idx = sq - 1;
  const rawRow = Math.floor(idx / GRID);
  const rawCol = idx % GRID;
  const row = GRID - 1 - rawRow;                           // flip vertically
  const col = rawRow % 2 === 0 ? rawCol : GRID - 1 - rawCol; // snake pattern
  return { row, col };
}

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

export default function SnakeLadderGame({ matchId, userId, wsToken, onComplete }: Props) {
  const [socket, setSocket] = useState<any>(null);
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'active' | 'finished'>('connecting');
  const [state, setState] = useState<any>(null);
  const [prevPositions, setPrevPositions] = useState<Record<string, number>>({});
  const [myPlayerIndex, setMyPlayerIndex] = useState(0);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [diceResult, setDiceResult] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);

  const diceAnim = useRef(new Animated.Value(1)).current;
  const toastAnim = useRef(new Animated.Value(0)).current;
  // Per-player token animations
  const tokenAnims = useRef<Record<string, { x: Animated.Value; y: Animated.Value }>>({}).current;

  const getTokenAnim = (key: string, initial: { x: number; y: number }) => {
    if (!tokenAnims[key]) {
      tokenAnims[key] = {
        x: new Animated.Value(initial.x),
        y: new Animated.Value(initial.y),
      };
    }
    return tokenAnims[key];
  };

  const showToast = (msg: string) => {
    setToast(msg);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToast(null));
  };

  useEffect(() => {
    const s = createGameEngineSocket(matchId, userId, wsToken);
    setSocket(s);

    s.on(E.CONNECT_ACK, (data: any) => {
      const players = data.state?.players || data.state?.metadata?.players || [];
      const idx = players.findIndex((p: any) => p.userId === userId);
      setMyPlayerIndex(idx >= 0 ? idx : 0);
      if (data.state?.pluginState) setState(data.state.pluginState);
      setStatus(data.state?.status === 'ACTIVE' ? 'active' : 'waiting');
      s.emit(E.READY);
    });

    s.on(E.START, (data: any) => {
      const ps = data.state?.pluginState ?? data.state;
      if (ps) setState(ps);
      setStatus('active');
    });

    s.on(E.SYNC, (data: any) => {
      if (!data.state) {
        // Scribble stroke events
        return;
      }
      const newState = data.state;

      // Show snake/ladder toast from server lastEvent
      if (newState.lastEvent === 'snake') {
        showToast(`🐍 Snake! Slid down to ${Object.values(newState.positions || {})[0]}`);
      } else if (newState.lastEvent === 'ladder') {
        showToast(`🪜 Ladder! Climbed to ${Object.values(newState.positions || {})[0]}`);
      }

      setState(newState);
      setRolling(false);
      setDiceResult(newState.lastDice ?? null);
      setIsMyTurn(newState.currentTurnIndex === myPlayerIndex);
    });

    s.on(E.GAME_OVER, (data: any) => {
      setStatus('finished');
      const won = (data.winner || data.state?.pluginState?.winner) === userId;
      showToast(won ? '🏆 You Won!' : '😢 You Lost');
      setTimeout(() => {
        onComplete({ score: won ? 1 : 0, won, xpEarned: won ? 60 : 10, durationSeconds: 0 });
      }, 2200);
    });

    s.on(E.ERROR, (e: any) => showToast('⚠️ ' + (e.message || 'Error')));
    return () => s.disconnect();
  }, [matchId, userId, wsToken]);

  useEffect(() => {
    if (state) setIsMyTurn((state.currentTurnIndex ?? 0) === myPlayerIndex);
  }, [state, myPlayerIndex]);

  const rollDice = useCallback(() => {
    if (!isMyTurn || rolling) return;
    setRolling(true);
    socket?.emit(E.MOVE, { type: 'ROLL' });

    Animated.sequence([
      Animated.spring(diceAnim, { toValue: 1.4, useNativeDriver: true, speed: 50 }),
      Animated.spring(diceAnim, { toValue: 0.9, useNativeDriver: true, speed: 40 }),
      Animated.spring(diceAnim, { toValue: 1, useNativeDriver: true, speed: 30 }),
    ]).start();
  }, [isMyTurn, socket, rolling, diceAnim]);

  // ── Board renderer ────────────────────────────────────────────────────────
  const renderBoard = () => {
    const cells = [];
    for (let sq = 1; sq <= 100; sq++) {
      const { row, col } = squareToGrid(sq);
      const hasSnake = SNAKES[sq] !== undefined;
      const hasLadder = LADDERS[sq] !== undefined;
      const isEven = ((Math.floor((sq - 1) / GRID)) + col) % 2 === 0;

      cells.push(
        <View
          key={sq}
          style={[
            styles.cell,
            {
              position: 'absolute',
              left: col * CELL,
              top: row * CELL,
              width: CELL,
              height: CELL,
              backgroundColor: hasSnake
                ? 'rgba(239,68,68,0.22)'
                : hasLadder
                ? 'rgba(34,197,94,0.22)'
                : isEven
                ? 'rgba(255,255,255,0.04)'
                : 'rgba(255,255,255,0.02)',
            },
          ]}
        >
          <Text style={styles.cellNum}>{sq}</Text>
          {hasSnake && <Text style={styles.cellIcon}>🐍</Text>}
          {hasLadder && <Text style={styles.cellIcon}>🪜</Text>}
        </View>
      );
    }
    return cells;
  };

  const renderPlayers = () => {
    if (!state?.positions) return null;
    return Object.entries(state.positions).map(([uid, pos]: [string, any], i: number) => {
      const square = pos > 0 ? pos : 1; // Show at square 1 if not started
      const { row, col } = squareToGrid(square);
      const offset = i * (CELL * 0.12);
      const size = CELL * 0.52;
      const isMe = uid === userId;

      return (
        <View
          key={`player-${uid}`}
          style={[
            styles.playerToken,
            {
              left: col * CELL + offset + (CELL - size) / 2,
              top: row * CELL + offset + (CELL - size) / 2,
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: PLAYER_COLORS[i % 4],
              borderWidth: isMe ? 2.5 : 1.5,
              borderColor: isMe ? '#FFF' : 'rgba(255,255,255,0.5)',
              zIndex: isMe ? 10 : 5,
            },
          ]}
        >
          <Text style={[styles.tokenNum, { fontSize: size * 0.38 }]}>{isMe ? '★' : i + 1}</Text>
        </View>
      );
    });
  };

  const renderVisuals = () => {
    return (
      <Svg height={BOARD_SIZE} width={BOARD_SIZE} style={{ position: 'absolute', top: 0, left: 0, zIndex: 3 }}>
        <Defs>
          <SvgLinearGradient id="ladderGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FACC15" stopOpacity="0.9" />
            <Stop offset="1" stopColor="#CA8A04" stopOpacity="0.9" />
          </SvgLinearGradient>
          <SvgLinearGradient id="snakeGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#EF4444" stopOpacity="0.9" />
            <Stop offset="1" stopColor="#991B1B" stopOpacity="0.9" />
          </SvgLinearGradient>
        </Defs>

        {Object.entries(LADDERS).map(([start, end]) => {
          const s = squareToGrid(Number(start));
          const e = squareToGrid(end);
          const x1 = s.col * CELL + CELL / 2;
          const y1 = s.row * CELL + CELL / 2;
          const x2 = e.col * CELL + CELL / 2;
          const y2 = e.row * CELL + CELL / 2;
          return (
            <React.Fragment key={`l-${start}`}>
              <Line x1={x1 - 8} y1={y1} x2={x2 - 8} y2={y2} stroke="url(#ladderGrad)" strokeWidth="6" strokeLinecap="round" />
              <Line x1={x1 + 8} y1={y1} x2={x2 + 8} y2={y2} stroke="url(#ladderGrad)" strokeWidth="6" strokeLinecap="round" />
              {[0.2, 0.4, 0.6, 0.8].map(ratio => {
                const px = x1 + (x2 - x1) * ratio;
                const py = y1 + (y2 - y1) * ratio;
                return <Line key={`l-${start}-${ratio}`} x1={px - 8} y1={py} x2={px + 8} y2={py} stroke="#FACC15" strokeWidth="4" />
              })}
            </React.Fragment>
          );
        })}

        {Object.entries(SNAKES).map(([start, end]) => {
          const s = squareToGrid(Number(start));
          const e = squareToGrid(end);
          const x1 = s.col * CELL + CELL / 2;
          const y1 = s.row * CELL + CELL / 2;
          const x2 = e.col * CELL + CELL / 2;
          const y2 = e.row * CELL + CELL / 2;
          const cx = (x1 + x2) / 2 + (Math.random() > 0.5 ? 40 : -40);
          const cy = (y1 + y2) / 2;
          return (
            <Path
              key={`s-${start}`}
              d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
              stroke="url(#snakeGrad)"
              strokeWidth="10"
              fill="none"
              strokeLinecap="round"
            />
          );
        })}
      </Svg>
    );
  };


  // ── Controls state ──────────────────────────────────────────────
  const dice = state?.lastDice ?? diceResult;
  const currentTurnIdx = state?.currentTurnIndex ?? 0;
  const currentColor = PLAYER_COLORS[currentTurnIdx % 4];

  // Dice faces
  const renderDiceFace = (val: number | null) => {
    const dots: Record<number, [number, number][]> = {
      1: [[50, 50]],
      2: [[30, 30], [70, 70]],
      3: [[30, 30], [50, 50], [70, 70]],
      4: [[30, 30], [70, 30], [30, 70], [70, 70]],
      5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]],
      6: [[30, 22], [70, 22], [30, 50], [70, 50], [30, 78], [70, 78]],
    };
    if (val === null || val === undefined) {
      return <Text style={styles.diceQ}>?</Text>;
    }
    return (dots[val] || []).map(([x, y], i) => (
      <View key={i} style={[styles.diceDot, { left: `${x}%` as any, top: `${y}%` as any }]} />
    ));
  };

  if (status === 'connecting') {
    return (
      <View style={styles.fullCenter}>
        <Text style={styles.splashIcon}>🐍</Text>
        <Text style={styles.splashTitle}>Snake & Ladder</Text>
        <Text style={styles.splashSub}>Connecting…</Text>
      </View>
    );
  }

  if (status === 'waiting') {
    return (
      <View style={styles.fullCenter}>
        <Text style={styles.splashIcon}>⏳</Text>
        <Text style={styles.splashTitle}>Snake & Ladder</Text>
        <Text style={styles.splashSub}>Waiting for opponent…</Text>
        <View style={styles.dotRow}>
          {[0,1,2].map(i => <WaitDot key={i} delay={i*200} />)}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Turn banner */}
      <View style={[styles.banner, { borderColor: currentColor + '60' }]}>
        <View style={[styles.bannerDot, { backgroundColor: currentColor }]} />
        <Text style={[styles.bannerText, { color: currentColor }]}>
          {rolling
            ? '🎲 Rolling…'
            : isMyTurn
            ? '🎲 Your Turn — Roll!'
            : `Player ${currentTurnIdx + 1}'s Turn`}
        </Text>
      </View>

      {/* Board */}
      <View style={[styles.board, { width: BOARD_SIZE, height: BOARD_SIZE }]}>
        {renderBoard()}
        {renderVisuals()}
        {renderPlayers()}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {/* Dice */}
        <Animated.View style={[styles.diceBox, { transform: [{ scale: diceAnim }] }]}>
          {renderDiceFace(dice)}
        </Animated.View>

        <TouchableOpacity
          style={[styles.rollBtn, (!isMyTurn || rolling) && styles.rollBtnDisabled]}
          onPress={rollDice}
          disabled={!isMyTurn || rolling}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={isMyTurn && !rolling ? ['#7C3AED', '#0891B2'] : ['#1E293B', '#1E293B']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.rollBtnGradient}
          >
            <Text style={[styles.rollBtnText, (!isMyTurn || rolling) && { color: '#475569' }]}>
              {rolling
                ? 'Rolling…'
                : isMyTurn
                ? 'Roll Dice 🎲'
                : 'Waiting…'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Position display */}
      {state?.positions && (
        <View style={styles.posRow}>
          {Object.entries(state.positions).map(([uid, pos]: any, i) => (
            <View key={uid} style={styles.posItem}>
              <View style={[styles.posColor, { backgroundColor: PLAYER_COLORS[i % 4] }]} />
              <Text style={styles.posText}>{uid === userId ? 'You' : `P${i + 1}`}: sq {pos > 0 ? pos : '–'}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Toast */}
      {toast && (
        <Animated.View style={[styles.toast, {
          opacity: toastAnim,
          transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
        }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      )}
    </View>
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
  container: { flex: 1, backgroundColor: '#05050F', alignItems: 'center', paddingTop: 8 },
  fullCenter: { flex: 1, backgroundColor: '#05050F', justifyContent: 'center', alignItems: 'center' },
  splashIcon: { fontSize: 64, marginBottom: 16 },
  splashTitle: { fontSize: 26, fontWeight: '900', color: '#F8FAFC', marginBottom: 8 },
  splashSub: { fontSize: 14, color: '#64748B', marginBottom: 20 },
  dotRow: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#7C3AED' },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, marginBottom: 10, backgroundColor: '#0F172A' },
  bannerDot: { width: 8, height: 8, borderRadius: 4 },
  bannerText: { fontSize: 13, fontWeight: '800' },

  board: { position: 'relative', backgroundColor: '#0C1222', borderRadius: 10, borderWidth: 2, borderColor: 'rgba(124,58,237,0.3)', overflow: 'hidden' },
  cell: { borderWidth: 0.3, borderColor: 'rgba(255,255,255,0.05)', justifyContent: 'flex-start', alignItems: 'flex-end', padding: 1 },
  cellNum: { fontSize: 6.5, color: 'rgba(255,255,255,0.25)', fontWeight: '600' },
  cellIcon: { position: 'absolute', bottom: 1, left: 1, fontSize: 10 },
  playerToken: { position: 'absolute', justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  tokenNum: { fontWeight: '900', color: '#FFF' },

  controls: { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 12, paddingHorizontal: 16, width: '100%' },
  diceBox: { width: 58, height: 58, backgroundColor: '#1E293B', borderRadius: 13, borderWidth: 2, borderColor: 'rgba(124,58,237,0.4)', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  diceBoxRolled: { borderColor: '#7C3AED', backgroundColor: '#1a1040' },
  diceDot: { position: 'absolute', width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#F8FAFC', transform: [{ translateX: -4.5 }, { translateY: -4.5 }] },
  diceQ: { fontSize: 26, color: '#475569', fontWeight: '900' },
  rollBtn: { flex: 1, borderRadius: 30, overflow: 'hidden' },
  rollBtnDisabled: { opacity: 0.5 },
  rollBtnGradient: { height: 52, justifyContent: 'center', alignItems: 'center' },
  rollBtnText: { color: '#FFF', fontSize: 15, fontWeight: '900' },

  posRow: { flexDirection: 'row', gap: 14, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' },
  posItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  posColor: { width: 10, height: 10, borderRadius: 5 },
  posText: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },

  toast: { position: 'absolute', bottom: 90, alignSelf: 'center', backgroundColor: '#1E293B', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1.5, borderColor: 'rgba(124,58,237,0.4)', elevation: 12 },
  toastText: { color: '#F8FAFC', fontSize: 14, fontWeight: '800' },
});
