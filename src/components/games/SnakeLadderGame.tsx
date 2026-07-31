import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions, Alert, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { HtmlGameResult } from '../../games/types';
import { createGameEngineSocket } from '../../services/socketClient';

const { width } = Dimensions.get('window');
const BOARD_SIZE = Math.floor(width - 24);
const GRID = 10;
const CELL = BOARD_SIZE / GRID;

// ── Official Snake & Ladder map (1-indexed) ──────────────────────────────────
const SNAKES: Record<number, number> = {
  17: 7,  54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 99: 78,
};
const LADDERS: Record<number, number> = {
  4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91,
};

const E = {
  READY: 'READY', MOVE: 'MOVE',
  CONNECT_ACK: 'CONNECT', START: 'START', SYNC: 'SYNC',
  GAME_OVER: 'GAME_OVER', ERROR: 'ERROR',
};

// Convert square number (1–100) to {row, col} from bottom-left
function squareToGrid(sq: number): { row: number; col: number } {
  const idx = sq - 1;
  const rawRow = Math.floor(idx / GRID);
  const rawCol = idx % GRID;
  const row = GRID - 1 - rawRow;
  const col = rawRow % 2 === 0 ? rawCol : GRID - 1 - rawCol;
  return { row, col };
}

type Props = {
  matchId: string;
  userId: string;
  wsToken: string;
  onComplete: (result: HtmlGameResult) => void;
};

const PLAYER_COLORS = ['#7C3AED', '#EF4444', '#22C55E', '#EAB308'];

export default function SnakeLadderGame({ matchId, userId, wsToken, onComplete }: Props) {
  const [socket, setSocket] = useState<any>(null);
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'active' | 'finished'>('connecting');
  const [state, setState] = useState<any>(null);
  const [myPlayerIndex, setMyPlayerIndex] = useState(0);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const diceAnim = useRef(new Animated.Value(1)).current;
  const tokenAnims = useRef<Record<string, Animated.Value>>({});

  useEffect(() => {
    const s = createGameEngineSocket(matchId, userId, wsToken);
    setSocket(s);

    s.on(E.CONNECT_ACK, (data: any) => {
      const players = data.state?.players || [];
      const idx = players.findIndex((p: any) => p.userId === userId);
      setMyPlayerIndex(idx >= 0 ? idx : 0);
      if (data.state?.pluginState) setState(data.state.pluginState);
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
        setIsMyTurn(data.state.currentTurnIndex === myPlayerIndex);
      }
    });

    s.on(E.GAME_OVER, (data: any) => {
      setStatus('finished');
      const won = data.winner === userId;
      Alert.alert(won ? '🏆 You Won!' : '😢 You Lost', won ? 'You reached 100 first!' : 'Better luck next time!', [
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
    if (!isMyTurn || state?.pendingDice !== null) return;
    socket?.emit(E.MOVE, { type: 'ROLL' });
    // Bounce animation
    Animated.sequence([
      Animated.spring(diceAnim, { toValue: 1.3, useNativeDriver: true, speed: 40 }),
      Animated.spring(diceAnim, { toValue: 1, useNativeDriver: true, speed: 30 }),
    ]).start();
  }, [isMyTurn, state, socket, diceAnim]);

  const renderBoard = () => {
    const cells = [];
    for (let sq = 100; sq >= 1; sq--) {
      const { row, col } = squareToGrid(sq);
      const hasSnake = SNAKES[sq] !== undefined;
      const hasLadder = LADDERS[sq] !== undefined;
      const isEven = (Math.floor((sq - 1) / GRID) + sq) % 2 === 0;

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
                ? 'rgba(239,68,68,0.25)'
                : hasLadder
                ? 'rgba(34,197,94,0.25)'
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
    return state.positions.map((pos: number, i: number) => {
      if (pos === 0) return null;
      const { row, col } = squareToGrid(pos);
      const offset = i * 4; // Offset overlapping tokens
      return (
        <View
          key={`player-${i}`}
          style={[
            styles.playerToken,
            {
              left: col * CELL + offset,
              top: row * CELL + offset,
              backgroundColor: PLAYER_COLORS[i % 4],
              width: CELL * 0.55,
              height: CELL * 0.55,
              borderRadius: CELL * 0.275,
            },
          ]}
        >
          <Text style={styles.tokenNum}>{i + 1}</Text>
        </View>
      );
    });
  };

  const dice = state?.pendingDice ?? state?.lastDice;
  const currentPlayer = state?.currentTurnIndex ?? 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Snake & Ladder</Text>
        <Text style={[styles.turnText, { color: PLAYER_COLORS[currentPlayer % 4] }]}>
          {status === 'waiting' ? 'Waiting for opponent…'
            : isMyTurn ? '🎲 Your Turn!' : `Player ${currentPlayer + 1}'s Turn`}
        </Text>
      </View>

      {/* Board */}
      <View style={[styles.board, { width: BOARD_SIZE, height: BOARD_SIZE }]}>
        {renderBoard()}
        {renderPlayers()}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <Animated.View style={[styles.diceBox, { transform: [{ scale: diceAnim }] }]}>
          <Text style={styles.diceValue}>{dice ?? '?'}</Text>
        </Animated.View>
        <TouchableOpacity
          style={[styles.rollBtn, (!isMyTurn || state?.pendingDice !== null) && styles.rollBtnDisabled]}
          onPress={rollDice}
          disabled={!isMyTurn || state?.pendingDice !== null}
        >
          <LinearGradient colors={['#7C3AED', '#0891B2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.rollBtnGradient}>
            <Text style={styles.rollBtnText}>
              {state?.pendingDice !== null ? `Move! (${dice})` : 'Roll Dice'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <Text style={styles.legendItem}>🐍 Snake goes down</Text>
        <Text style={styles.legendItem}>🪜 Ladder goes up</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05050F', alignItems: 'center', paddingTop: 12 },
  header: { alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '900', color: '#F8FAFC' },
  turnText: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  board: { position: 'relative', backgroundColor: '#0F172A', borderRadius: 10, borderWidth: 2, borderColor: 'rgba(124,58,237,0.3)', overflow: 'hidden' },
  cell: { borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.06)', justifyContent: 'flex-start', alignItems: 'flex-end', padding: 1 },
  cellNum: { fontSize: 7, color: 'rgba(255,255,255,0.3)', fontWeight: '600' },
  cellIcon: { position: 'absolute', bottom: 1, left: 1, fontSize: 10 },
  playerToken: { position: 'absolute', justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, borderWidth: 2, borderColor: '#FFF' },
  tokenNum: { fontSize: 8, fontWeight: '900', color: '#FFF' },
  controls: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 12, paddingHorizontal: 12, width: '100%' },
  diceBox: { width: 56, height: 56, backgroundColor: '#1E293B', borderRadius: 12, borderWidth: 2, borderColor: 'rgba(124,58,237,0.5)', justifyContent: 'center', alignItems: 'center' },
  diceValue: { fontSize: 26, fontWeight: '900', color: '#F8FAFC' },
  rollBtn: { flex: 1 },
  rollBtnDisabled: { opacity: 0.45 },
  rollBtnGradient: { height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  rollBtnText: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  legend: { flexDirection: 'row', gap: 20, marginTop: 10 },
  legendItem: { color: '#94A3B8', fontSize: 12 },
});
