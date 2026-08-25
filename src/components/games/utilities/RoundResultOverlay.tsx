/**
 * RoundResultOverlay — shown between rounds in multi-round matches.
 *
 * Displays:
 *  - Round result (win/loss/draw for this round)
 *  - Cumulative standings
 *  - Countdown to next round
 *
 * Does NOT show final match result — that's GameResultOverlay's job.
 */

'use strict';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

type Standing = {
  userId: string;
  roundScore: number;
  matchScore: number;
  position: number;
  name?: string;
};

type Props = {
  /** Round result from backend */
  roundResult: {
    winner: string | null;
    standings: Standing[];
    roundScore?: number;
  } | null;
  /** Current user's ID */
  userId: string;
  /** Current round number */
  roundNumber: number;
  /** Total rounds */
  totalRounds: number;
  /** Player display names (keyed by userId) */
  playerNames?: Record<string, string>;
  /** Called when the round result has been shown and next round is starting */
  onContinue?: () => void;
};

export default function RoundResultOverlay({
  roundResult,
  userId,
  roundNumber,
  totalRounds,
  playerNames = {},
  onContinue,
}: Props) {
  const [countdown, setCountdown] = useState(5);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    if (countdown <= 0) {
      onContinue?.();
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, onContinue]);

  if (!roundResult) return null;

  const myStanding = roundResult.standings?.find((s) => s.userId === userId);
  const myPosition = myStanding?.position ?? 0;
  const isWinner = roundResult.winner === userId;

  const positionIcon = (pos: number) => {
    if (pos === 1) return '🥇';
    if (pos === 2) return '🥈';
    if (pos === 3) return '🥉';
    return `#${pos}`;
  };

  const resultColor = isWinner ? '#22C55E' : myPosition <= roundResult.standings.length / 2 ? '#A78BFA' : '#EF4444';
  const resultText = isWinner ? 'You won this round!' : myPosition <= roundResult.standings.length / 2 ? 'Nice play!' : 'Keep trying!';

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.container, { opacity: fadeAnim }]}>
      <LinearGradient
        colors={['rgba(10,15,30,0.97)', 'rgba(20,10,50,0.97)']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
        {/* Round header */}
        <View style={styles.roundHeader}>
          <Ionicons name="trophy" size={24} color="#FBBF24" />
          <Text style={styles.roundTitle}>Round {roundNumber} of {totalRounds}</Text>
        </View>

        {/* Result */}
        <View style={[styles.resultBadge, { borderColor: resultColor }]}>
          <Text style={[styles.resultText, { color: resultColor }]}>{resultText}</Text>
          <Text style={styles.positionText}>{positionIcon(myPosition)}</Text>
        </View>

        {/* My score */}
        {myStanding && (
          <View style={styles.myScoreBox}>
            <Text style={styles.myScoreLabel}>This Round</Text>
            <Text style={styles.myScoreValue}>{myStanding.roundScore}</Text>
            <Text style={styles.myScoreSublabel}>Total: {myStanding.matchScore}</Text>
          </View>
        )}

        {/* Standings */}
        <View style={styles.standingsCard}>
          <Text style={styles.standingsTitle}>Standings</Text>
          {roundResult.standings
            .sort((a, b) => a.position - b.position)
            .slice(0, 5)
            .map((s) => {
              const isMe = s.userId === userId;
              return (
                <View key={s.userId} style={[styles.standingRow, isMe && styles.standingRowMe]}>
                  <Text style={styles.standingPosition}>{positionIcon(s.position)}</Text>
                  <Text style={[styles.standingName, isMe && styles.standingNameMe]} numberOfLines={1}>
                    {playerNames[s.userId] || (isMe ? 'You' : `Player ${s.position}`)}
                  </Text>
                  <Text style={[styles.standingScore, isMe && styles.standingScoreMe]}>
                    {s.matchScore}
                  </Text>
                </View>
              );
            })}
        </View>

        {/* Next round countdown */}
        <Text style={styles.nextRoundText}>
          Next round in {countdown}s...
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 16,
    maxWidth: 340,
    width: '100%',
  },
  roundHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roundTitle: {
    color: '#C4B5FD',
    fontSize: 16,
    fontWeight: '700',
  },
  resultBadge: {
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: 'rgba(124,58,237,0.1)',
  },
  resultText: {
    fontSize: 18,
    fontWeight: '800',
  },
  positionText: {
    fontSize: 28,
    marginTop: 4,
  },
  myScoreBox: {
    alignItems: 'center',
    gap: 2,
  },
  myScoreLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  myScoreValue: {
    color: '#FBBF24',
    fontSize: 36,
    fontWeight: '900',
  },
  myScoreSublabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '600',
  },
  standingsCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
    width: '100%',
    gap: 6,
  },
  standingsTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  standingRowMe: {
    backgroundColor: 'rgba(124,58,237,0.15)',
  },
  standingPosition: {
    width: 30,
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  standingName: {
    flex: 1,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
  },
  standingNameMe: {
    color: '#A78BFA',
    fontWeight: '800',
  },
  standingScore: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '700',
    minWidth: 40,
    textAlign: 'right',
  },
  standingScoreMe: {
    color: '#FBBF24',
  },
  nextRoundText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    fontWeight: '600',
  },
});
