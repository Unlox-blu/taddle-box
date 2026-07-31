import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { HtmlGameResult } from '../../games/types';
import { createGameEngineSocket } from '../../services/socketClient';

// ── Constants ────────────────────────────────────────────────────────────────
const { width } = Dimensions.get('window');
const BOARD_SIZE = Math.min(Math.floor(width - 16), 400);
const CELL = BOARD_SIZE / 15;

// Player colors
const PLAYER_COLORS = ['#EF4444', '#3B82F6', '#22C55E', '#EAB308'] as const;
const PLAYER_NAMES = ['Red', 'Blue', 'Green', 'Yellow'] as const;
const HOME_BG = ['rgba(239,68,68,0.25)', 'rgba(59,130,246,0.25)', 'rgba(34,197,94,0.25)', 'rgba(234,179,8,0.25)'] as const;

// ── Ludo board path (15×15 grid, col/row coordinates) ────────────────────────
// The standard Ludo board path for player 0 (Red), starting at col=1, row=6
// 56 steps total: outer track (52) + home column (4) + home (1)
const LUDO_PATH: [number, number][] = [
  // Bottom-left to right (row 6, going right through middle section)
  [1,6],[2,6],[3,6],[4,6],[5,6],
  // Up the left side
  [6,5],[6,4],[6,3],[6,2],[6,1],[6,0],
  // Right across top
  [7,0],[8,0],
  // Down the right of top
  [8,1],[8,2],[8,3],[8,4],[8,5],
  // Right across upper-middle
  [9,6],[10,6],[11,6],[12,6],[13,6],[14,6],
  // Down right side
  [14,7],[14,8],
  // Left across bottom-right
  [13,8],[12,8],[11,8],[10,8],[9,8],
  // Down lower-right
  [8,9],[8,10],[8,11],[8,12],[8,13],[8,14],
  // Left across bottom
  [7,14],[6,14],
  // Up left side bottom
  [6,13],[6,12],[6,11],[6,10],[6,9],
  // Left across lower-middle
  [5,8],[4,8],[3,8],[2,8],[1,8],[0,8],
  // Up left side upper
  [0,7],[0,6],
  // Home column (Red — going right)
  [1,7],[2,7],[3,7],[4,7],[5,7],
];

// Safe squares (star positions) — col, row
const SAFE_CELLS = new Set(['1,6','6,2','2,8','8,13','13,8','8,1','12,6','6,12','7,7']);

// Home quadrant positions for 4 tokens
const HOME_POSITIONS: [number, number][][] = [
  [[1.5,1.5],[3.5,1.5],[1.5,3.5],[3.5,3.5]], // Red TL
  [[11.5,1.5],[13.5,1.5],[11.5,3.5],[13.5,3.5]], // Blue TR
  [[11.5,11.5],[13.5,11.5],[11.5,13.5],[13.5,13.5]], // Green BR
  [[1.5,11.5],[3.5,11.5],[1.5,13.5],[3.5,13.5]], // Yellow BL
];

// Path offset per player (how many steps ahead on the LUDO_PATH they start)
const PLAYER_PATH_OFFSET = [0, 13, 26, 39];

const E = {
  READY: 'READY', MOVE: 'MOVE', CONNECT_ACK: 'CONNECT',
  START: 'START', SYNC: 'SYNC', GAME_OVER: 'GAME_OVER', ERROR: 'ERROR',
};

type Props = {
  matchId: string;
  userId: string;
  wsToken: string;
  onComplete: (result: HtmlGameResult) => void;
};

function getTokenScreenPos(playerIdx: number, tokenId: number, pos: number): { col: number; row: number } {
  if (pos === -1) {
    // In home yard
    const [col, row] = HOME_POSITIONS[playerIdx % 4][tokenId % 4];
    return { col, row };
  }
  if (pos >= 56) {
    // Reached home center
    return { col: 7, row: 7 };
  }
  const offset = PLAYER_PATH_OFFSET[playerIdx % 4];
  const pathIdx = (offset + pos) % LUDO_PATH.length;
  const [col, row] = LUDO_PATH[pathIdx];
  return { col: col + 0.5, row: row + 0.5 };
}

export default function LudoGame({ matchId, userId, wsToken, onComplete }: Props) {
  const [socket, setSocket] = useState<any>(null);
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'active' | 'finished'>('connecting');
  const [state, setState] = useState<any>(null);
  const [myPlayerIndex, setMyPlayerIndex] = useState<number>(0);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const diceAnim = useRef(new Animated.Value(0)).current;
  const diceScale = useRef(new Animated.Value(1)).current;
  const toastAnim = useRef(new Animated.Value(0)).current;

  const showToast = (msg: string) => {
    setToast(msg);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToast(null));
  };

  useEffect(() => {
    const s = createGameEngineSocket(matchId, userId, wsToken);
    setSocket(s);

    s.on(E.CONNECT_ACK, (data: any) => {
      const ps = data.state?.pluginState;
      const players = data.state?.players || data.state?.metadata?.players || [];
      const idx = players.findIndex((p: any) => p.userId === userId);
      setMyPlayerIndex(idx >= 0 ? idx : 0);
      if (ps) setState(ps);
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
      setState(data.state);
      const curTurnIdx = data.state.currentTurnIndex ?? 0;
      setIsMyTurn(curTurnIdx === myPlayerIndex);
    });

    s.on(E.GAME_OVER, (data: any) => {
      setStatus('finished');
      const winnerId = data.winner || data.state?.pluginState?.winner;
      const won = winnerId === userId;
      showToast(won ? '🏆 You Won!' : '😢 You Lost');
      setTimeout(() => {
        onComplete({ score: won ? 1 : 0, won, xpEarned: won ? 60 : 10, durationSeconds: 0 });
      }, 2000);
    });

    s.on(E.ERROR, (e: any) => {
      showToast('⚠️ ' + (e.message || 'Error'));
    });

    return () => s.disconnect();
  }, [matchId, userId, wsToken]);

  useEffect(() => {
    if (state) setIsMyTurn((state.currentTurnIndex ?? 0) === myPlayerIndex);
  }, [state, myPlayerIndex]);

  const rollDice = useCallback(() => {
    if (!isMyTurn || state?.dice !== null) return;
    socket?.emit(E.MOVE, { type: 'ROLL' });
    // Shake + scale animation
    Animated.sequence([
      Animated.parallel([
        Animated.timing(diceAnim, { toValue: 1, duration: 60, useNativeDriver: true }),
        Animated.timing(diceScale, { toValue: 1.2, duration: 100, useNativeDriver: true }),
      ]),
      Animated.timing(diceAnim, { toValue: -1, duration: 80, useNativeDriver: true }),
      Animated.timing(diceAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(diceAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
        Animated.timing(diceScale, { toValue: 1, duration: 100, useNativeDriver: true }),
      ]),
    ]).start();
  }, [isMyTurn, state, socket]);

  const moveToken = useCallback((tokenId: number) => {
    if (!isMyTurn || state?.dice === null) return;
    socket?.emit(E.MOVE, { type: 'MOVE_TOKEN', tokenId });
  }, [isMyTurn, state, socket]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderBoardGrid = () => {
    const cells = [];
    for (let row = 0; row < 15; row++) {
      for (let col = 0; col < 15; col++) {
        const key = `${col},${row}`;
        const isSafe = SAFE_CELLS.has(key);
        // Home quadrants
        const isRedHome = col < 6 && row < 6;
        const isBlueHome = col > 8 && row < 6;
        const isGreenHome = col > 8 && row > 8;
        const isYellowHome = col < 6 && row > 8;
        const isCenter = col >= 6 && col <= 8 && row >= 6 && row <= 8;

        // Path cells
        const isPath = !isRedHome && !isBlueHome && !isGreenHome && !isYellowHome && !isCenter;

        // Home column coloring (Red: Left, Blue: Top, Green: Right, Yellow: Bottom)
        const isRedCol = row === 7 && col >= 1 && col <= 5;
        const isBlueCol = col === 7 && row >= 1 && row <= 5;
        const isGreenCol = row === 7 && col >= 9 && col <= 13;
        const isYellowCol = col === 7 && row >= 9 && row <= 13;

        let bgColor = 'rgba(255,255,255,0.03)';
        if (isRedHome) bgColor = 'rgba(239,68,68,0.18)';
        else if (isBlueHome) bgColor = 'rgba(59,130,246,0.18)';
        else if (isGreenHome) bgColor = 'rgba(34,197,94,0.18)';
        else if (isYellowHome) bgColor = 'rgba(234,179,8,0.18)';
        else if (isCenter) bgColor = 'rgba(124,58,237,0.25)';
        else if (isRedCol) bgColor = 'rgba(239,68,68,0.35)';
        else if (isBlueCol) bgColor = 'rgba(59,130,246,0.35)';
        else if (isGreenCol) bgColor = 'rgba(34,197,94,0.35)';
        else if (isYellowCol) bgColor = 'rgba(234,179,8,0.35)';

        cells.push(
          <View
            key={key}
            style={{
              position: 'absolute',
              left: col * CELL,
              top: row * CELL,
              width: CELL,
              height: CELL,
              backgroundColor: bgColor,
              borderWidth: 0.3,
              borderColor: 'rgba(255,255,255,0.05)',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {isSafe && isPath && (
              <Text style={{ fontSize: CELL * 0.5, opacity: 0.5 }}>★</Text>
            )}
            {isCenter && col === 7 && row === 7 && (
              <Text style={{ fontSize: CELL * 1.2, color: '#7C3AED' }}>★</Text>
            )}
          </View>
        );
      }
    }
    return cells;
  };

  const renderTokens = () => {
    if (!state?.tokens) return null;
    const allTokens: JSX.Element[] = [];

    Object.entries(state.tokens).forEach(([uid, playerTokens]: [string, any]) => {
      const pi = state.turnOrder?.indexOf(uid) ?? 0;
      const color = PLAYER_COLORS[pi % 4];
      const canMoveThisPlayer = isMyTurn && uid === userId && state.dice !== null;

      (playerTokens || []).forEach((token: any) => {
        const { col, row } = getTokenScreenPos(pi, token.id, token.pos ?? -1);
        const canMove = canMoveThisPlayer && (state.movableTokens?.includes(token.id) ?? true);
        const size = CELL * 0.72;
        const offset = (token.id % 2) * (CELL * 0.08) - CELL * 0.04;

        allTokens.push(
          <TouchableOpacity
            key={`${uid}-${token.id}`}
            onPress={() => canMove && moveToken(token.id)}
            activeOpacity={canMove ? 0.7 : 1}
            style={{
              position: 'absolute',
              left: col * CELL - size / 2 + offset,
              top: row * CELL - size / 2 + offset,
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: color,
              borderWidth: canMove ? 2 : 1,
              borderColor: canMove ? '#FFFFFF' : 'rgba(255,255,255,0.7)',
              justifyContent: 'center',
              alignItems: 'center',
              elevation: canMove ? 8 : 4,
              shadowColor: canMove ? color : '#000',
              shadowOpacity: canMove ? 0.8 : 0.4,
              shadowRadius: canMove ? 6 : 3,
              shadowOffset: { width: 0, height: 0 },
              zIndex: canMove ? 10 : 5,
            }}
          >
            {/* Inner bevel for 3D token look */}
            <View style={{
              position: 'absolute',
              inset: 3,
              borderRadius: size / 2,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.4)',
              backgroundColor: 'rgba(255,255,255,0.15)',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Text style={{ fontSize: size * 0.38, fontWeight: '900', color: '#FFF', opacity: 0.9 }}>
                {token.id + 1}
              </Text>
            </View>
            {canMove && (
              <View style={{
                position: 'absolute', inset: -3, borderRadius: size / 2 + 3,
                borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)',
              }} />
            )}
          </TouchableOpacity>
        );
      });
    });

    return allTokens;
  };

  const renderDice = () => {
    const face = state?.dice;
    const dots: Record<number, [number, number][]> = {
      1: [[50, 50]],
      2: [[28, 28], [72, 72]],
      3: [[28, 28], [50, 50], [72, 72]],
      4: [[28, 28], [72, 28], [28, 72], [72, 72]],
      5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
      6: [[28, 22], [72, 22], [28, 50], [72, 50], [28, 78], [72, 78]],
    };
    const diceDots = typeof face === 'number' ? (dots[face] || []) : [];
    return (
      <Animated.View style={[
        styles.dice,
        {
          transform: [
            { rotate: diceAnim.interpolate({ inputRange: [-1, 1], outputRange: ['-20deg', '20deg'] }) },
            { scale: diceScale },
          ],
        },
        face !== null && face !== undefined && styles.diceRolled,
      ]}>
        {typeof face === 'number' ? (
          diceDots.map(([x, y], i) => (
            <View key={i} style={[styles.diceDot, { left: `${x}%` as any, top: `${y}%` as any }]} />
          ))
        ) : (
          <Text style={styles.diceQuest}>?</Text>
        )}
      </Animated.View>
    );
  };

  const currentTurnIdx = state?.currentTurnIndex ?? 0;
  const currentColor = PLAYER_COLORS[currentTurnIdx % 4];
  const currentName = PLAYER_NAMES[currentTurnIdx % 4];
  const hasDice = state?.dice !== null && state?.dice !== undefined;

  // ── Full render ────────────────────────────────────────────────────────────
  if (status === 'connecting') {
    return (
      <View style={styles.fullCenter}>
        <Text style={styles.splashIcon}>🎲</Text>
        <Text style={styles.splashTitle}>Ludo Classic</Text>
        <Text style={styles.splashSub}>Connecting…</Text>
      </View>
    );
  }

  if (status === 'waiting') {
    return (
      <View style={styles.fullCenter}>
        <Text style={styles.splashIcon}>⏳</Text>
        <Text style={styles.splashTitle}>Ludo Classic</Text>
        <Text style={styles.splashSub}>Waiting for players…</Text>
        <View style={styles.dotRow}>
          {[0,1,2].map(i => <WaitDot key={i} delay={i*200} />)}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Status banner */}
      <View style={[styles.banner, { borderColor: currentColor + '60' }]}>
        <View style={[styles.bannerDot, { backgroundColor: currentColor }]} />
        <Text style={[styles.bannerText, { color: currentColor }]}>
          {isMyTurn
            ? hasDice
              ? `🎯 Rolled ${state.dice} — tap your token!`
              : '🎲 Your Turn — Roll the dice!'
            : `${currentName}'s Turn`}
        </Text>
      </View>

      {/* Board */}
      <View style={[styles.board, { width: BOARD_SIZE, height: BOARD_SIZE }]}>
        {renderBoardGrid()}
        {renderTokens()}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          onPress={rollDice}
          disabled={!isMyTurn || hasDice}
          activeOpacity={0.8}
        >
          {renderDice()}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.rollBtn,
            (!isMyTurn || hasDice) && styles.rollBtnDisabled,
          ]}
          onPress={rollDice}
          disabled={!isMyTurn || hasDice}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={isMyTurn && !hasDice ? ['#7C3AED', '#0891B2'] : ['#1E293B', '#1E293B']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.rollBtnGradient}
          >
            <Text style={[styles.rollBtnText, (!isMyTurn || hasDice) && { color: '#475569' }]}>
              {hasDice ? `Rolled ${state.dice} — Pick token` : isMyTurn ? 'Roll Dice 🎲' : `${currentName}'s turn…`}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Player legend */}
      <View style={styles.legend}>
        {Object.entries(state?.scores || {}).map(([uid, score]: any, i: number) => (
          <View key={uid} style={[styles.legendItem, uid === userId && styles.legendItemMe]}>
            <View style={[styles.legendDot, { backgroundColor: PLAYER_COLORS[i % 4] }]} />
            <Text style={styles.legendText}>{uid === userId ? 'You' : `P${i + 1}`}</Text>
          </View>
        ))}
      </View>

      {/* Toast */}
      {toast && (
        <Animated.View style={[styles.toast, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
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
  bannerText: { fontSize: 14, fontWeight: '800' },

  board: { position: 'relative', backgroundColor: '#0C1222', borderRadius: 12, borderWidth: 2, borderColor: 'rgba(124,58,237,0.35)', overflow: 'hidden' },

  controls: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, marginTop: 14, width: '100%' },
  dice: {
    width: 58, height: 58, backgroundColor: '#1E293B', borderRadius: 13,
    borderWidth: 2, borderColor: 'rgba(124,58,237,0.4)',
    justifyContent: 'center', alignItems: 'center', position: 'relative',
  },
  diceRolled: { borderColor: '#7C3AED', backgroundColor: '#1a1040' },
  diceDot: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#F8FAFC', transform: [{ translateX: -5 }, { translateY: -5 }] },
  diceQuest: { fontSize: 26, color: '#475569', fontWeight: '900' },
  rollBtn: { flex: 1, borderRadius: 30, overflow: 'hidden' },
  rollBtnDisabled: { opacity: 0.55 },
  rollBtnGradient: { height: 52, justifyContent: 'center', alignItems: 'center' },
  rollBtnText: { color: '#FFF', fontSize: 15, fontWeight: '900', letterSpacing: 0.3 },

  legend: { flexDirection: 'row', gap: 12, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0F172A', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  legendItemMe: { borderColor: 'rgba(124,58,237,0.4)' },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },

  toast: { position: 'absolute', bottom: 100, alignSelf: 'center', backgroundColor: '#1E293B', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1.5, borderColor: 'rgba(124,58,237,0.4)', elevation: 10 },
  toastText: { color: '#F8FAFC', fontSize: 15, fontWeight: '800' },
});
