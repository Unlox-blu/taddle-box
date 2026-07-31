import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { HtmlGameResult } from '../../games/types';
import { createGameEngineSocket } from '../../services/socketClient';

// ── Constants ────────────────────────────────────────────────────────────────
const { width } = Dimensions.get('window');
const BOARD_SIZE = Math.floor(width - 24);
const CELL = BOARD_SIZE / 15; // 15x15 board

// Player color palettes
const COLORS = {
  red:    { base: '#EF4444', light: '#FCA5A5', home: '#7F1D1D' },
  blue:   { base: '#3B82F6', light: '#93C5FD', home: '#1E3A5F' },
  green:  { base: '#22C55E', light: '#86EFAC', home: '#14532D' },
  yellow: { base: '#EAB308', light: '#FDE047', home: '#78350F' },
};

const PLAYER_COLORS = ['red', 'blue', 'green', 'yellow'] as const;

// Standardized Protocol Events
const E = {
  READY: 'READY', MOVE: 'MOVE', CONNECT_ACK: 'CONNECT',
  START: 'START', SYNC: 'SYNC', GAME_OVER: 'GAME_OVER', ERROR: 'ERROR',
};

type TokenPos = { player: number; token: number; position: number }; // position: 0=home, 1-57=path, 58=safe

type Props = {
  matchId: string;
  userId: string;
  wsToken: string;
  onComplete: (result: HtmlGameResult) => void;
};

export default function LudoGame({ matchId, userId, wsToken, onComplete }: Props) {
  const [socket, setSocket] = useState<any>(null);
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'active' | 'finished'>('connecting');
  const [state, setState] = useState<any>(null);
  const [myPlayerIndex, setMyPlayerIndex] = useState<number>(0);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const diceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const s = createGameEngineSocket(matchId, userId, wsToken);
    setSocket(s);

    s.on(E.CONNECT_ACK, (data: any) => {
      const ps = data.state?.pluginState;
      const players = data.state?.players || [];
      const idx = players.findIndex((p: any) => p.userId === userId);
      setMyPlayerIndex(idx >= 0 ? idx : 0);
      if (ps) setState(ps);
      setStatus(data.state?.status === 'ACTIVE' ? 'active' : 'waiting');
      s.emit(E.READY);
    });

    s.on(E.START, (data: any) => {
      setState(data.state?.pluginState);
      setStatus('active');
    });

    s.on(E.SYNC, (data: any) => {
      if (data.state) {
        setState(data.state);
        const curTurnIdx = data.state.currentTurnIndex;
        setIsMyTurn(curTurnIdx === myPlayerIndex);
      }
    });

    s.on(E.GAME_OVER, (data: any) => {
      setStatus('finished');
      const winnerId = data.winner;
      const won = winnerId === userId;
      Alert.alert(won ? '🏆 You Won!' : '😢 You Lost', won ? 'Congratulations!' : 'Better luck next time!', [
        { text: 'OK', onPress: () => onComplete({ score: won ? 1 : 0, won, xpEarned: won ? 60 : 10, durationSeconds: 0 }) },
      ]);
    });

    s.on(E.ERROR, (e: any) => Alert.alert('Error', e.message));
    return () => s.disconnect();
  }, [matchId, userId, wsToken]);

  useEffect(() => {
    if (state) setIsMyTurn(state.currentTurnIndex === myPlayerIndex);
  }, [state, myPlayerIndex]);

  const rollDice = useCallback(() => {
    if (!isMyTurn || state?.dice !== null) return;
    socket?.emit(E.MOVE, { type: 'ROLL' });

    // Dice roll animation
    Animated.sequence([
      Animated.timing(diceAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(diceAnim, { toValue: -1, duration: 80, useNativeDriver: true }),
      Animated.timing(diceAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(diceAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
    ]).start();
  }, [isMyTurn, state, socket, diceAnim]);

  const moveToken = useCallback((tokenIdx: number) => {
    if (!isMyTurn || state?.dice === null) return;
    socket?.emit(E.MOVE, { type: 'MOVE_TOKEN', tokenIndex: tokenIdx });
  }, [isMyTurn, state, socket]);

  const renderDice = () => {
    const face = state?.dice ?? '?';
    const dots: { [key: number]: [number, number][] } = {
      1: [[0.5, 0.5]],
      2: [[0.25, 0.25], [0.75, 0.75]],
      3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
      4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
      5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
      6: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.5], [0.75, 0.5], [0.25, 0.75], [0.75, 0.75]],
    };
    const diceDots = typeof face === 'number' ? (dots[face] || []) : [];
    return (
      <Animated.View style={[styles.dice, { transform: [{ rotate: diceAnim.interpolate({ inputRange: [-1, 1], outputRange: ['-15deg', '15deg'] }) }] }]}>
        {diceDots.map(([x, y], i) => (
          <View key={i} style={[styles.diceDot, { left: `${x * 100}%` as any, top: `${y * 100}%` as any }]} />
        ))}
        {typeof face === 'string' && <Text style={styles.diceText}>{face}</Text>}
      </Animated.View>
    );
  };

  const renderTokens = () => {
    if (!state?.tokens) return null;
    return state.tokens.flatMap((playerTokens: number[], pi: number) => {
      const color = COLORS[PLAYER_COLORS[pi % 4]];
      return playerTokens.map((pos: number, ti: number) => {
        const canMove = isMyTurn && pi === myPlayerIndex && state.dice !== null && state.movableTokens?.includes(ti);
        const size = CELL * 0.75;
        // Position tokens on board — simplified visualization
        const row = Math.floor(pos / 15) * CELL + CELL * 0.125;
        const col = (pos % 15) * CELL + CELL * 0.125;
        return (
          <TouchableOpacity
            key={`p${pi}t${ti}`}
            style={[styles.token, { width: size, height: size, borderRadius: size / 2, backgroundColor: color.base, left: col, top: row, borderWidth: canMove ? 3 : 1, borderColor: canMove ? '#FFF' : 'rgba(255,255,255,0.3)' }]}
            onPress={() => canMove && moveToken(ti)}
            activeOpacity={canMove ? 0.7 : 1}
          >
            <Text style={styles.tokenText}>{ti + 1}</Text>
          </TouchableOpacity>
        );
      });
    });
  };

  const currentPlayer = state?.currentTurnIndex ?? 0;
  const curColor = COLORS[PLAYER_COLORS[currentPlayer % 4]];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Ludo Classic</Text>
        <Text style={[styles.turnText, { color: curColor.base }]}>
          {status === 'waiting' ? 'Waiting for players…'
            : isMyTurn ? '🎲 Your Turn!' : `Player ${currentPlayer + 1}'s Turn`}
        </Text>
      </View>

      {/* Board */}
      <View style={[styles.board, { width: BOARD_SIZE, height: BOARD_SIZE }]}>
        {/* Home quadrants */}
        {PLAYER_COLORS.map((c, i) => {
          const col = COLORS[c];
          const positions = [
            { top: 0, left: 0 },
            { top: 0, right: 0 },
            { bottom: 0, right: 0 },
            { bottom: 0, left: 0 },
          ];
          return (
            <View key={c} style={[styles.homeQuadrant, positions[i] as any, { backgroundColor: col.home }]}>
              <Text style={[styles.homeLabel, { color: col.light }]}>{c.toUpperCase()[0]}</Text>
            </View>
          );
        })}
        {/* Center star */}
        <View style={styles.centerStar}>
          <Text style={styles.centerStarText}>★</Text>
        </View>
        {/* Tokens */}
        {renderTokens()}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {renderDice()}
        <TouchableOpacity
          style={[styles.rollBtn, (!isMyTurn || state?.dice !== null) && styles.rollBtnDisabled]}
          onPress={rollDice}
          disabled={!isMyTurn || state?.dice !== null}
        >
          <LinearGradient colors={['#7C3AED', '#0891B2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.rollBtnGradient}>
            <Text style={styles.rollBtnText}>{state?.dice !== null ? `Rolled: ${state?.dice}` : 'Roll Dice'}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05050F', alignItems: 'center', paddingTop: 12 },
  header: { alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '900', color: '#F8FAFC', letterSpacing: 0.5 },
  turnText: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  board: { position: 'relative', backgroundColor: '#0F172A', borderRadius: 12, borderWidth: 2, borderColor: 'rgba(124,58,237,0.4)', overflow: 'hidden' },
  homeQuadrant: { position: 'absolute', width: BOARD_SIZE * 0.4, height: BOARD_SIZE * 0.4, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  homeLabel: { fontSize: 42, fontWeight: '900', opacity: 0.3 },
  centerStar: { position: 'absolute', top: '50%', left: '50%', width: CELL * 3, height: CELL * 3, marginLeft: -CELL * 1.5, marginTop: -CELL * 1.5, justifyContent: 'center', alignItems: 'center' },
  centerStarText: { fontSize: 40, color: '#7C3AED' },
  token: { position: 'absolute', justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  tokenText: { fontSize: 10, fontWeight: '900', color: '#FFF' },
  controls: { flexDirection: 'row', alignItems: 'center', marginTop: 20, gap: 16 },
  dice: { width: 60, height: 60, backgroundColor: '#1E293B', borderRadius: 12, borderWidth: 2, borderColor: 'rgba(124,58,237,0.5)', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  diceDot: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#F8FAFC', transform: [{ translateX: -5 }, { translateY: -5 }] },
  diceText: { color: '#94A3B8', fontSize: 22, fontWeight: '900' },
  rollBtn: { flex: 1 },
  rollBtnDisabled: { opacity: 0.5 },
  rollBtnGradient: { height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  rollBtnText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 0.3 },
});
