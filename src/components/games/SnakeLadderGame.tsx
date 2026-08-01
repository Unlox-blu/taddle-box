import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Line, Circle, Path, Defs, LinearGradient as SvgGrad, Stop, G,
} from 'react-native-svg';
import type { HtmlGameResult } from '../../games/types';
import { createGameEngineSocket } from '../../services/socketClient';

const { width: SCREEN_W } = Dimensions.get('window');
const BOARD_SIZE = Math.min(Math.floor(SCREEN_W - 24), 400);
const GRID = 10;
const CELL = BOARD_SIZE / GRID;

// ── Board data ─────────────────────────────────────────────────────────────
const SNAKES: Record<number, number> = { 99: 54, 70: 55, 52: 42, 43: 22, 36: 6, 32: 10, 49: 11 };
const LADDERS: Record<number, number> = { 4: 25, 13: 46, 33: 49, 42: 63, 50: 69, 62: 81, 74: 92 };

// Alternating board colors — vibrant jewel tones
const CELL_COLORS = [
  ['#1B4D3E', '#0D6E4F'],  // emerald dark / light
  ['#1E3A5F', '#1A4A7A'],  // sapphire dark / light
];

const PLAYER_COLORS = ['#A855F7', '#F97316', '#22C55E', '#EAB308'];
const PLAYER_LABELS = ['★', '♦', '●', '▲'];

// Convert square (1-100) to pixel center {x, y}
function squareToCenter(sq: number): { x: number; y: number } {
  const idx = sq - 1;
  const rawRow = Math.floor(idx / GRID);
  const rawCol = idx % GRID;
  const row = GRID - 1 - rawRow;
  const col = rawRow % 2 === 0 ? rawCol : GRID - 1 - rawCol;
  return {
    x: col * CELL + CELL / 2,
    y: row * CELL + CELL / 2,
  };
}

// Deterministic control point offset based on snake index
function snakeCtrlOffset(startSq: number): number {
  const offsets = [45, -45, 38, -38, 50, -50, 42];
  return offsets[startSq % offsets.length];
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
  opponentName?: string;
  onComplete: (result: HtmlGameResult) => void;
};

export default function SnakeLadderGame({ matchId, userId, wsToken, opponentName, onComplete }: Props) {
  const [socket, setSocket] = useState<any>(null);
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'active' | 'finished'>('connecting');
  const [state, setState] = useState<any>(null);
  const [myPlayerIndex, setMyPlayerIndex] = useState(0);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [lastDice, setLastDice] = useState<number | null>(null);

  const diceAnim = useRef(new Animated.Value(1)).current;
  const diceRotate = useRef(new Animated.Value(0)).current;
  const toastAnim = useRef(new Animated.Value(0)).current;

  // Per-player animated positions
  const tokenAnims = useRef<Record<string, { x: Animated.Value; y: Animated.Value }>>({}).current;

  const getOrCreateTokenAnim = useCallback((uid: string, sq: number) => {
    if (!tokenAnims[uid]) {
      const { x, y } = squareToCenter(Math.max(1, sq));
      tokenAnims[uid] = {
        x: new Animated.Value(x),
        y: new Animated.Value(y),
      };
    }
    return tokenAnims[uid];
  }, []);

  const animateToken = useCallback((uid: string, toSq: number) => {
    const anim = tokenAnims[uid];
    if (!anim) return;
    const { x, y } = squareToCenter(Math.max(1, toSq));
    Animated.parallel([
      Animated.spring(anim.x, { toValue: x, useNativeDriver: false, speed: 12, bounciness: 6 }),
      Animated.spring(anim.y, { toValue: y, useNativeDriver: false, speed: 12, bounciness: 6 }),
    ]).start();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(2500),
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
      if (!data.state) return;
      const newState = data.state;

      if (newState.lastEvent === 'snake') {
        showToast(`🐍 Snake! Slid down to ${Object.values(newState.positions || {})[0]}`);
      } else if (newState.lastEvent === 'ladder') {
        showToast(`🪜 Ladder! Climbed to ${Object.values(newState.positions || {})[0]}`);
      }

      // Animate tokens to new positions
      if (newState.positions) {
        Object.entries(newState.positions).forEach(([uid, pos]: [string, any]) => {
          const sq = pos > 0 ? pos : 1;
          if (tokenAnims[uid]) {
            animateToken(uid, sq);
          }
        });
      }

      setState(newState);
      setRolling(false);
      setLastDice(newState.lastDice ?? null);
      setIsMyTurn(newState.currentTurnIndex === myPlayerIndex);
    });

    s.on(E.GAME_OVER, (data: any) => {
      setStatus('finished');
      const won = (data.winner || data.state?.pluginState?.winner) === userId;
      showToast(won ? '🏆 You Won!' : '😢 You Lost');
      setTimeout(() => {
        onComplete({ score: won ? 1 : 0, won, xpEarned: won ? 60 : 10, durationSeconds: 0 });
      }, 2500);
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

    // Animate dice: bounce + slight rotation
    diceRotate.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.spring(diceAnim, { toValue: 1.35, useNativeDriver: true, speed: 80 }),
        Animated.timing(diceRotate, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(diceAnim, { toValue: 0.88, useNativeDriver: true, speed: 50 }),
        Animated.timing(diceRotate, { toValue: -0.5, duration: 100, useNativeDriver: true }),
      ]),
      Animated.spring(diceAnim, { toValue: 1, useNativeDriver: true, speed: 30 }),
    ]).start();
  }, [isMyTurn, socket, rolling]);

  // ── Board renderer ────────────────────────────────────────────────────────
  const boardCells = useMemo(() => {
    const cells = [];
    for (let sq = 1; sq <= 100; sq++) {
      const idx = sq - 1;
      const rawRow = Math.floor(idx / GRID);
      const rawCol = idx % GRID;
      const row = GRID - 1 - rawRow;
      const col = rawRow % 2 === 0 ? rawCol : GRID - 1 - rawCol;

      const hasSnake = SNAKES[sq] !== undefined;
      const hasLadder = LADDERS[sq] !== undefined;
      // Checkerboard: alternate based on sum of row/col
      const colorSet = (row + col) % 2 === 0 ? CELL_COLORS[0] : CELL_COLORS[1];
      const bgColor = hasSnake ? '#4B1C1C' : hasLadder ? '#1C3B1C' : colorSet[(row + col) % 2 === 0 ? 0 : 1];

      cells.push(
        <View
          key={sq}
          style={{
            position: 'absolute',
            left: col * CELL,
            top: row * CELL,
            width: CELL,
            height: CELL,
            backgroundColor: bgColor,
            borderWidth: 0.5,
            borderColor: 'rgba(0,0,0,0.3)',
            justifyContent: 'flex-start',
            alignItems: 'flex-end',
            padding: 1.5,
          }}
        >
          <Text style={styles.cellNum}>{sq}</Text>
        </View>
      );
    }
    return cells;
  }, []);

  // ── SVG overlays: snakes & ladders ────────────────────────────────────────
  const svgOverlays = useMemo(() => {
    const ladderElements: React.ReactElement[] = [];
    const snakeElements: React.ReactElement[] = [];

    // Draw ladders
    Object.entries(LADDERS).forEach(([startStr, end]) => {
      const start = Number(startStr);
      const s = squareToCenter(start);
      const e = squareToCenter(end);

      // Ladder: two parallel rails + rungs
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const ux = dy / len;  // perpendicular unit vector
      const uy = -dx / len;
      const railOffset = 5;

      const rails = [
        { x1: s.x + ux * railOffset, y1: s.y + uy * railOffset, x2: e.x + ux * railOffset, y2: e.y + uy * railOffset },
        { x1: s.x - ux * railOffset, y1: s.y - uy * railOffset, x2: e.x - ux * railOffset, y2: e.y - uy * railOffset },
      ];

      // Rungs at even intervals
      const rungs = [];
      const rungCount = Math.max(2, Math.floor(len / (CELL * 0.7)));
      for (let r = 1; r <= rungCount; r++) {
        const t = r / (rungCount + 1);
        const mx = s.x + dx * t;
        const my = s.y + dy * t;
        rungs.push(
          <Line
            key={`rung-${start}-${r}`}
            x1={mx + ux * (railOffset + 2)} y1={my + uy * (railOffset + 2)}
            x2={mx - ux * (railOffset + 2)} y2={my - uy * (railOffset + 2)}
            stroke="#F59E0B" strokeWidth="3.5" strokeLinecap="round"
          />
        );
      }

      ladderElements.push(
        <G key={`ladder-${start}`}>
          {/* Shadow rails */}
          {rails.map((r, i) => (
            <Line key={`shadow-${i}`} x1={r.x1 + 1} y1={r.y1 + 1} x2={r.x2 + 1} y2={r.y2 + 1}
              stroke="rgba(0,0,0,0.4)" strokeWidth="5" strokeLinecap="round" />
          ))}
          {/* Gold rails */}
          {rails.map((r, i) => (
            <Line key={`rail-${i}`} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2}
              stroke="url(#ladderGold)" strokeWidth="4.5" strokeLinecap="round" />
          ))}
          {rungs}
          {/* Top glow circle */}
          <Circle cx={e.x} cy={e.y} r={5} fill="#FDE68A" opacity={0.9} />
          {/* Bottom anchor */}
          <Circle cx={s.x} cy={s.y} r={4} fill="#D97706" opacity={0.8} />
        </G>
      );
    });

    // Draw snakes — sinuous SVG path with deterministic control points
    Object.entries(SNAKES).forEach(([startStr, end]) => {
      const start = Number(startStr);
      const s = squareToCenter(start);
      const e = squareToCenter(end);

      const ctrl1Offset = snakeCtrlOffset(start);
      const ctrl2Offset = -ctrl1Offset;

      // Mid points for cubic bezier
      const mx = (s.x + e.x) / 2;
      const my = (s.y + e.y) / 2;
      const cx1 = mx + ctrl1Offset;
      const cy1 = my - Math.abs(ctrl1Offset) * 0.3;
      const cx2 = mx + ctrl2Offset;
      const cy2 = my + Math.abs(ctrl2Offset) * 0.3;

      const path = `M ${s.x} ${s.y} C ${cx1} ${cy1} ${cx2} ${cy2} ${e.x} ${e.y}`;

      snakeElements.push(
        <G key={`snake-${start}`}>
          {/* Shadow */}
          <Path d={path} stroke="rgba(0,0,0,0.5)" strokeWidth="12" fill="none" strokeLinecap="round" />
          {/* Body gradient */}
          <Path d={path} stroke="url(#snakeGreen)" strokeWidth="10" fill="none" strokeLinecap="round" />
          {/* Scale pattern - lighter center stripe */}
          <Path d={path} stroke="rgba(134,239,172,0.35)" strokeWidth="3" fill="none"
            strokeLinecap="round" strokeDasharray="6,8" />
          {/* Snake head at start */}
          <Circle cx={s.x} cy={s.y} r={8} fill="#16A34A" />
          <Circle cx={s.x} cy={s.y} r={8} fill="none" stroke="#4ADE80" strokeWidth="1.5" />
          {/* Eyes */}
          <Circle cx={s.x - 3} cy={s.y - 2} r={2} fill="#FFF" />
          <Circle cx={s.x + 3} cy={s.y - 2} r={2} fill="#FFF" />
          <Circle cx={s.x - 3} cy={s.y - 2} r={1} fill="#000" />
          <Circle cx={s.x + 3} cy={s.y - 2} r={1} fill="#000" />
          {/* Tail tip */}
          <Circle cx={e.x} cy={e.y} r={4} fill="#15803D" />
        </G>
      );
    });

    return { ladderElements, snakeElements };
  }, []);

  // ── Player tokens ─────────────────────────────────────────────────────────
  const renderTokens = () => {
    if (!state?.positions) return null;

    return Object.entries(state.positions).map(([uid, pos]: [string, any], i: number) => {
      const sq = pos > 0 ? pos : 1;
      const anim = getOrCreateTokenAnim(uid, sq);
      const isMe = uid === userId;
      const color = PLAYER_COLORS[i % 4];
      const tokenSize = CELL * 0.56;

      return (
        <Animated.View
          key={`tok-${uid}`}
          style={{
            position: 'absolute',
            width: tokenSize,
            height: tokenSize,
            borderRadius: tokenSize / 2,
            left: Animated.subtract(anim.x, tokenSize / 2 - (i % 2 === 0 ? -2 : 4)),
            top: Animated.subtract(anim.y, tokenSize / 2 - (i > 1 ? 4 : -2)),
            backgroundColor: color,
            borderWidth: isMe ? 3 : 2,
            borderColor: isMe ? '#FFF' : 'rgba(255,255,255,0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            elevation: isMe ? 10 : 5,
            shadowColor: color,
            shadowOpacity: 0.7,
            shadowRadius: isMe ? 6 : 3,
            shadowOffset: { width: 0, height: 2 },
            zIndex: isMe ? 20 : 10,
          }}
        >
          <Text style={{ fontSize: tokenSize * 0.38, fontWeight: '900', color: '#FFF' }}>
            {PLAYER_LABELS[i % 4]}
          </Text>
        </Animated.View>
      );
    });
  };

  // ── Dice face ──────────────────────────────────────────────────────────────
  const DOT_POSITIONS: Record<number, [number, number][]> = {
    1: [[50, 50]],
    2: [[28, 28], [72, 72]],
    3: [[28, 28], [50, 50], [72, 72]],
    4: [[28, 28], [72, 28], [28, 72], [72, 72]],
    5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
    6: [[28, 22], [72, 22], [28, 50], [72, 50], [28, 78], [72, 78]],
  };

  const renderDice = () => {
    const dots = lastDice ? (DOT_POSITIONS[lastDice] || []) : [];
    return dots.map(([x, y], i) => (
      <View key={i} style={[styles.diceDot, {
        left: `${x}%` as any,
        top: `${y}%` as any,
      }]} />
    ));
  };

  // ── Turn info ──────────────────────────────────────────────────────────────
  const currentTurnIdx = state?.currentTurnIndex ?? 0;
  const currentColor = PLAYER_COLORS[currentTurnIdx % 4];

  // ── Screens ────────────────────────────────────────────────────────────────
  if (status === 'connecting') {
    return (
      <LinearGradient colors={['#0D1117', '#0D2137']} style={styles.fullCenter}>
        <Text style={styles.splashEmoji}>🐍</Text>
        <Text style={styles.splashTitle}>Snake & Ladder</Text>
        <Text style={styles.splashSub}>Connecting to match…</Text>
        <LoadingDots />
      </LinearGradient>
    );
  }

  if (status === 'waiting') {
    return (
      <LinearGradient colors={['#0D1117', '#0D2137']} style={styles.fullCenter}>
        <Text style={styles.splashEmoji}>⏳</Text>
        <Text style={styles.splashTitle}>Snake & Ladder</Text>
        <Text style={styles.splashSub}>Waiting for opponent…</Text>
        <LoadingDots />
      </LinearGradient>
    );
  }

  const spin = diceRotate.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-15deg', '0deg', '15deg'],
  });

  return (
    <LinearGradient colors={['#0D1117', '#0C1829']} style={styles.container}>
      {/* Header / Turn banner */}
      <View style={styles.header}>
        <View style={[styles.turnPill, { borderColor: currentColor + '60', backgroundColor: currentColor + '15' }]}>
          <View style={[styles.turnDot, { backgroundColor: currentColor }]} />
          <Text style={[styles.turnText, { color: currentColor }]}>
            {rolling
              ? '🎲 Rolling…'
              : isMyTurn
              ? '🎲 Your Turn!'
              : `Player ${currentTurnIdx + 1}'s Turn`}
          </Text>
        </View>

        {/* Score pills */}
        {state?.positions && (
          <View style={styles.scorePills}>
            {Object.entries(state.positions).map(([uid, pos]: any, i) => (
              <View key={uid} style={[styles.scorePill, { backgroundColor: PLAYER_COLORS[i % 4] + '25', borderColor: PLAYER_COLORS[i % 4] + '50' }]}>
                <Text style={[styles.scorePillLabel, { color: PLAYER_COLORS[i % 4] }]}>
                  {uid === userId ? 'You' : (opponentName || `P${i + 1}`)}
                </Text>
                <Text style={[styles.scorePillVal, { color: '#FFF' }]}>
                  sq {pos > 0 ? pos : '–'}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Board */}
      <View style={[styles.boardWrapper, { width: BOARD_SIZE + 8, height: BOARD_SIZE + 8 }]}>
        <LinearGradient
          colors={['rgba(124,58,237,0.5)', 'rgba(6,182,212,0.3)']}
          style={[styles.boardGlow, { width: BOARD_SIZE + 8, height: BOARD_SIZE + 8 }]}
        />
        <View style={[styles.board, { width: BOARD_SIZE, height: BOARD_SIZE }]}>
          {/* Cell backgrounds */}
          {boardCells}

          {/* SVG snakes & ladders (rendered above cells, below tokens) */}
          <Svg
            height={BOARD_SIZE} width={BOARD_SIZE}
            style={{ position: 'absolute', top: 0, left: 0, zIndex: 3 }}
          >
            <Defs>
              <SvgGrad id="ladderGold" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#FDE68A" stopOpacity="1" />
                <Stop offset="0.5" stopColor="#F59E0B" stopOpacity="1" />
                <Stop offset="1" stopColor="#D97706" stopOpacity="1" />
              </SvgGrad>
              <SvgGrad id="snakeGreen" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#16A34A" stopOpacity="1" />
                <Stop offset="0.5" stopColor="#22C55E" stopOpacity="1" />
                <Stop offset="1" stopColor="#15803D" stopOpacity="1" />
              </SvgGrad>
            </Defs>
            {/* Ladders behind snakes */}
            {svgOverlays.ladderElements}
            {svgOverlays.snakeElements}
          </Svg>

          {/* Player tokens */}
          {renderTokens()}
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {/* Dice */}
        <Animated.View style={[styles.diceOuter, { transform: [{ scale: diceAnim }, { rotate: spin }] }]}>
          <LinearGradient
            colors={lastDice ? ['#1E1B4B', '#2E1065'] : ['#0F172A', '#1E293B']}
            style={styles.diceInner}
          >
            {lastDice ? renderDice() : <Text style={styles.diceQ}>?</Text>}
          </LinearGradient>
        </Animated.View>

        {/* Roll button */}
        <TouchableOpacity
          style={[styles.rollBtn, (!isMyTurn || rolling) && styles.rollBtnDisabled]}
          onPress={rollDice}
          disabled={!isMyTurn || rolling}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={isMyTurn && !rolling ? ['#7C3AED', '#0891B2'] : ['#1E293B', '#1E293B']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.rollBtnGrad}
          >
            <Text style={[styles.rollBtnText, (!isMyTurn || rolling) && { color: '#475569' }]}>
              {rolling ? 'Rolling…' : isMyTurn ? 'Roll Dice  🎲' : 'Waiting…'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#16A34A' }]} />
          <Text style={styles.legendText}>Snake (slide down)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
          <Text style={styles.legendText}>Ladder (climb up)</Text>
        </View>
      </View>

      {/* Toast notification */}
      {toast && (
        <Animated.View style={[styles.toast, {
          opacity: toastAnim,
          transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
        }]}>
          <LinearGradient colors={['#1E1B4B', '#1E293B']} style={styles.toastInner}>
            <Text style={styles.toastText}>{toast}</Text>
          </LinearGradient>
        </Animated.View>
      )}
    </LinearGradient>
  );
}

// ── Loading dots ─────────────────────────────────────────────────────────────
function LoadingDots() {
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 24 }}>
      {[0, 1, 2].map(i => <PulseDot key={i} delay={i * 200} />)}
    </View>
  );
}

function PulseDot({ delay }: { delay: number }) {
  const anim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 400, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return <Animated.View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#7C3AED', opacity: anim }} />;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', paddingTop: 8, paddingBottom: 16 },
  fullCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  splashEmoji: { fontSize: 72, marginBottom: 12 },
  splashTitle: { fontSize: 28, fontWeight: '900', color: '#F8FAFC', marginBottom: 6 },
  splashSub: { fontSize: 15, color: '#64748B' },

  header: { width: '100%', paddingHorizontal: 12, marginBottom: 8, gap: 8 },
  turnPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 24, borderWidth: 1.5, alignSelf: 'center',
  },
  turnDot: { width: 9, height: 9, borderRadius: 4.5 },
  turnText: { fontSize: 14, fontWeight: '800' },

  scorePills: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  scorePill: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, borderWidth: 1, alignItems: 'center' },
  scorePillLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  scorePillVal: { fontSize: 11, fontWeight: '600', opacity: 0.85 },

  boardWrapper: { position: 'relative', justifyContent: 'center', alignItems: 'center' },
  boardGlow: { position: 'absolute', borderRadius: 14, opacity: 0.8 },
  board: {
    position: 'relative', backgroundColor: '#0C1829',
    borderRadius: 10, overflow: 'hidden',
    borderWidth: 1.5, borderColor: 'rgba(124,58,237,0.4)',
    elevation: 16, shadowColor: '#7C3AED', shadowOpacity: 0.4,
    shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  cellNum: { fontSize: 6.5, color: 'rgba(255,255,255,0.3)', fontWeight: '700' },

  controls: {
    flexDirection: 'row', alignItems: 'center', marginTop: 14,
    gap: 12, paddingHorizontal: 12, width: '100%',
  },
  diceOuter: {
    width: 62, height: 62,
    borderRadius: 15, borderWidth: 2.5,
    borderColor: 'rgba(124,58,237,0.6)',
    elevation: 8, shadowColor: '#7C3AED', shadowOpacity: 0.5, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  diceInner: {
    width: 60, height: 60, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', position: 'relative',
  },
  diceDot: {
    position: 'absolute', width: 10, height: 10,
    borderRadius: 5, backgroundColor: '#F8FAFC',
    transform: [{ translateX: -5 }, { translateY: -5 }],
    elevation: 2,
  },
  diceQ: { fontSize: 28, color: '#475569', fontWeight: '900' },

  rollBtn: { flex: 1, borderRadius: 32, overflow: 'hidden', elevation: 6 },
  rollBtnDisabled: { opacity: 0.5 },
  rollBtnGrad: { height: 56, justifyContent: 'center', alignItems: 'center' },
  rollBtnText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },

  legend: { flexDirection: 'row', gap: 16, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: '#64748B', fontSize: 11, fontWeight: '600' },

  toast: { position: 'absolute', bottom: 100, alignSelf: 'center', borderRadius: 24, overflow: 'hidden', elevation: 16 },
  toastInner: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, borderWidth: 1.5, borderColor: 'rgba(124,58,237,0.5)' },
  toastText: { color: '#F8FAFC', fontSize: 15, fontWeight: '900' },
});
