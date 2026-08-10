import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, radii, fontSizes, spacing } from '../../theme';
import { cycleInfo, STREAK_CYCLE } from '../../utils/streak';

interface StreakCardProps {
  streakDays: number;
  /** True when today's day is already counted (end_date is today). */
  todayFilled?: boolean;
  /** True when a missed day has opened a 24-hour restore window. */
  restorable?: boolean;
  /** XP cost shown on the restore chip (only when restorable). */
  restoreCost?: number;
  /** Opens the streak popup (which hosts the restore flow). */
  onPress: () => void;
}

export default function StreakCard({
  streakDays,
  todayFilled = false,
  restorable = false,
  restoreCost = 0,
  onPress,
}: StreakCardProps) {
  const { pos, labels } = cycleInfo(streakDays);
  // The tick that represents "today": the just-filled one when today is
  // already counted, otherwise the next tick to earn (or the missed one when
  // the streak is restorable). Clamped — a completed cycle (pos === 7) with a
  // missed day means the missed tick lives in the next cycle, off-screen.
  const todayIdx = Math.min(
    restorable ? pos : todayFilled ? pos - 1 : pos,
    STREAK_CYCLE - 1
  );
  const showMissed = restorable && pos < STREAK_CYCLE;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
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
        {labels.map((day, i) => {
          const done = i < pos;
          const missed = showMissed && i === pos;
          const isToday = i === todayIdx;
          return (
            <View
              key={day}
              style={[
                styles.dot,
                done && styles.dotDone,
                missed && styles.dotMissed,
                !done && !missed && isToday && styles.dotToday,
              ]}
            >
              <Text style={styles.dotDay}>Day {day}</Text>
              <Text style={styles.dotIcon}>
                {done ? '✓' : missed ? '⚠️' : isToday ? '🔥' : ''}
              </Text>
            </View>
          );
        })}
      </View>

      {restorable && (
        <TouchableOpacity style={styles.restoreChip} onPress={onPress} activeOpacity={0.85}>
          <Text style={styles.restoreChipText}>
            ⚠️ Missed a day — restore for {restoreCost} XP
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
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
    flex: 1, height: 38,
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
  dotMissed: {
    backgroundColor: 'rgba(239,68,68,0.14)',
    borderColor: 'rgba(239,68,68,0.45)',
  },
  dotDay:  { fontSize: 8, color: colors.text.muted },
  dotIcon: { fontSize: 11 },
  restoreChip: {
    marginTop: 10,
    backgroundColor: 'rgba(251,191,36,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.4)',
    borderRadius: radii.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  restoreChipText: { fontSize: fontSizes.xs, fontWeight: '800', color: colors.xpGold },
});
