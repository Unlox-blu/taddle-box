import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, Alert } from 'react-native';
import { Chessboard, ChessboardRef } from '@crewbeat/expo-chessboard';
import { Chess } from 'chess.js';
import { createGameEngineSocket } from '../../services/socketClient';
import type { HtmlGameResult } from '../../games/types';

type Props = {
  matchId: string;
  userId: string;
  wsToken: string;
  onComplete: (result: HtmlGameResult) => void;
};

// Our Standardized WebSocket Protocol Events
const EVENTS = {
  JOIN: 'JOIN', READY: 'READY', MOVE: 'MOVE',
  CONNECT_ACK: 'CONNECT', START: 'START', STATE: 'STATE',
  SYNC: 'SYNC', GAME_OVER: 'GAME_OVER', ERROR: 'ERROR',
};

export default function ChessGame({ matchId, userId, wsToken, onComplete }: Props) {
  const [chess] = useState(new Chess());
  const chessboardRef = useRef<ChessboardRef>(null);
  
  const [socket, setSocket] = useState<any>(null);
  const [status, setStatus] = useState<string>('connecting');
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');
  const [opponentInfo, setOpponentInfo] = useState<any>(null);

  useEffect(() => {
    const s = createGameEngineSocket(matchId, userId, wsToken);
    setSocket(s);

    s.on('connect', () => {
      console.log('Chess Socket Connected');
    });

    s.on(EVENTS.CONNECT_ACK, (data: any) => {
      console.log('CONNECT_ACK', data);
      
      const { state } = data;
      setStatus(state.status || 'waiting');

      if (state.pluginState?.fen) {
        chess.load(state.pluginState.fen);
        chessboardRef.current?.resetBoard(state.pluginState.fen);
      }

      if (state.players) {
        const me = state.players.find((p: any) => p.userId === userId);
        const opp = state.players.find((p: any) => p.userId !== userId);
        if (me) setPlayerColor(me.color);
        if (opp) setOpponentInfo(opp);
      }

      // Automatically tell server we are ready
      s.emit(EVENTS.READY);
    });

    s.on(EVENTS.START, (data: any) => {
      console.log('GAME START', data);
      setStatus('active');
      if (data.state.pluginState?.fen) {
        chess.load(data.state.pluginState.fen);
        chessboardRef.current?.resetBoard(data.state.pluginState.fen);
      }
    });

    s.on(EVENTS.SYNC, (data: any) => {
      console.log('SYNC', data);
      if (data.state?.fen) {
        chess.load(data.state.fen);
        chessboardRef.current?.resetBoard(data.state.fen);
      }
    });

    s.on(EVENTS.GAME_OVER, (data: any) => {
      console.log('GAME OVER', data);
      setStatus('finished');
      
      const winnerId = data.state?.pluginState?.winner;
      const isDraw = data.state?.pluginState?.drawReason;
      
      let result: HtmlGameResult = {
        score: 0,
        won: winnerId === userId,
        xpEarned: winnerId === userId ? 100 : (isDraw ? 30 : 10),
        durationSeconds: 0,
      };

      if (winnerId === userId) {
        Alert.alert('You Won!', 'Checkmate!', [{ text: 'OK', onPress: () => onComplete(result) }]);
      } else if (isDraw) {
        Alert.alert('Draw!', data.state.pluginState.drawReason, [{ text: 'OK', onPress: () => onComplete(result) }]);
      } else {
        Alert.alert('You Lost!', 'Checkmate!', [{ text: 'OK', onPress: () => onComplete(result) }]);
      }
    });

    s.on(EVENTS.ERROR, (error: any) => {
      Alert.alert('Game Error', error.message);
    });

    return () => {
      s.disconnect();
    };
  }, [matchId, userId, wsToken, chess]);

  const onMove = ({ move }: { move: { from: string; to: string; promotion?: string } }) => {
    // If not our turn or game not active, reject local move
    if (status !== 'active' || chess.turn() !== playerColor) {
      chessboardRef.current?.resetBoard(chess.fen()); // Snap back
      return;
    }

    // Check legality locally first
    try {
      const result = chess.move(move);
      if (!result) {
        chessboardRef.current?.resetBoard(chess.fen());
        return;
      }
      
      // Emit to server
      socket?.emit(EVENTS.MOVE, { from: move.from, to: move.to, promotion: move.promotion || 'q' });
      
    } catch (e) {
      chessboardRef.current?.resetBoard(chess.fen());
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {status === 'waiting' && <Text style={styles.statusText}>Waiting for opponent...</Text>}
        {status === 'active' && (
          <Text style={styles.statusText}>
            {chess.turn() === playerColor ? 'Your Turn' : "Opponent's Turn"}
          </Text>
        )}
      </View>
      
      <View style={styles.boardContainer}>
        <Chessboard
          ref={chessboardRef}
          onMove={onMove}
          boardOrientation={playerColor === 'w' ? 'white' : 'black'}
          colors={{ black: '#7C3AED', white: '#E5E7EB' }} // Taddle theme colors
        />
      </View>

      {status === 'connecting' && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05050F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    marginBottom: 24,
  },
  statusText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  boardContainer: {
    width: '100%',
    aspectRatio: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 5, 15, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  }
});
