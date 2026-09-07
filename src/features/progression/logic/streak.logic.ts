// Streaks run in continuous 7-day cycles: Day 1-7, then Day 8-14, and so on.
// The cycle is anchored to the streak's own start day, and tick labels are
// absolute day numbers.
export const STREAK_CYCLE = 7;

export interface CycleInfo {
  /** How many ticks are already filled in the current cycle (1..7). */
  pos: number;
  /** Absolute day number of the first tick in the current cycle (0, 7, 14…). */
  base: number;
  /** Absolute day labels for the 7 ticks (e.g. [8, 9, …, 14]). */
  labels: number[];
}

export const cycleInfo = (streakCount: number): CycleInfo => {
  const safe = Math.max(1, streakCount || 0);
  const pos = ((safe - 1) % STREAK_CYCLE) + 1;
  const base = Math.floor((safe - 1) / STREAK_CYCLE) * STREAK_CYCLE;
  return {
    pos,
    base,
    labels: Array.from({ length: STREAK_CYCLE }, (_, i) => base + i + 1),
  };
};

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();
