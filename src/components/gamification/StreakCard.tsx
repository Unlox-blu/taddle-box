import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radii, fontSizes, spacing } from '../../theme';

const DAYS = ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'];

interface StreakCardProps {
  streakDays: number;
  completedDays: number[]; // indices 0–6 that are done
  todayIndex: number;
}

export default function StreakCard({ streakDays, completedDays, todayIndex }: StreakCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>🔥 Daily Streak</Text>
        <View style={styles.countBox}>
          <Text style={styles.days}>{streakDays}</Text>
          <Text style={styles.daysLabel}>
            {streakDays === 1 ? 'day' : 'days'} streak!
          </Text>
        </View>
      </View>
      <View style={styles.dots}>
        {DAYS.map((d, i) => {
          const done  = completedDays.includes(i);
          const today = i === todayIndex;
          return (
            <View
              key={i}
              style={[
                styles.dot,
                done  && styles.dotDone,
                today && styles.dotToday,
              ]}
            >
              <Text style={styles.dotDay}>{d}</Text>
              <Text style={styles.dotIcon}>{done ? '✓' : today ? '🔥' : ''}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.bg.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.text.primary },
  countBox: { alignItems: 'flex-end' },
  days: {
    fontFamily: 'System', fontWeight: '800',
    fontSize: fontSizes.xl, color: colors.xpGold,
  },
  daysLabel: { fontSize: fontSizes.xs, color: colors.text.muted },
  dots: { flexDirection: 'row', gap: 6 },
  dot: {
    flex: 1, height: 36,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    gap: 1,
  },
  dotDone: {
    backgroundColor: 'rgba(251,191,36,0.13)',
    borderColor: 'rgba(251,191,36,0.28)',
  },
  dotToday: {
    backgroundColor: 'rgba(251,191,36,0.22)',
    borderColor: colors.xpGold,
  },
  dotDay:  { fontSize: 8, color: colors.text.muted },
  dotIcon: { fontSize: 11 },
});
