'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// STREAK RULES — the single source of truth for every streak formula.
//
// Streaks run in continuous 7-day cycles: Day 1-7, then Day 8-14, and so on.
// The cycle is anchored to the streak's own start day, never to calendar
// day-of-week — the milestone reward fires on every 7th consecutive day.
// There is no notion of a "week" anywhere in the streak logic.
//
// Both the streak service (runtime state machine) and the one-off data
// cleanup script import THIS module, so a data migration can never drift
// from the code that reads the data.
// ─────────────────────────────────────────────────────────────────────────────

const CYCLE = 7;
// Restore window: the full day after the missed day (24 hours). If the user
// does not restore before the deadline the streak resets completely.
const RESTORE_WINDOW_DAYS = 3; // end_date + 3 days at 00:00 (see restoreDeadlineFor)

// Local-midnight boundary — day math always happens in the server's local
// day, matching `new Date()` used by the state machine.
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const daysBetween = (a, b) =>
  Math.round((startOfDay(b) - startOfDay(a)) / 86400000);

// Restore deadline: the streak breaks the day after end_date (missed day),
// and the user gets the FULL following day — a 24-hour window — to revive
// it. So the deadline is (end_date + 3 days) at 00:00.
const restoreDeadlineFor = (endDate) => {
  const deadline = new Date(endDate);
  deadline.setDate(deadline.getDate() + RESTORE_WINDOW_DAYS);
  deadline.setHours(0, 0, 0, 0);
  return deadline;
};

// Milestone reward: 100 XP at Day 7, +100 XP per cycle, capped at 5000.
// Day 7 → 100, Day 14 → 200, Day 21 → 300, ... Day 350 → 5000 (cap).
const rewardXpFor = (count) => {
  if (count % CYCLE !== 0) return 0;
  return Math.min(100 * (count / CYCLE), 5000);
};

// The next milestone day STRICTLY AFTER the current count (7, 14, 21, ...).
// At an exact milestone (e.g. Day 7) the reward is already earned, so the
// next one is Day 14. No streak (0) points at Day 7.
const nextMilestoneDay = (count) => {
  if (count <= 0) return CYCLE;
  return count % CYCLE === 0 ? count + CYCLE : Math.ceil(count / CYCLE) * CYCLE;
};

// Restore cost: 70% of the NEXT milestone reward (min 50 XP). Restoring is
// always worth it — finishing the next milestone pays back more XP than the
// cost, and the streak itself keeps growing. Examples: 5-day → 70 XP,
// 14-day → 140 XP, 500-day → 5040 XP.
const restoreCostFor = (count) =>
  Math.max(50, Math.ceil(rewardXpFor(nextMilestoneDay(count)) * 0.7));

module.exports = {
  CYCLE,
  RESTORE_WINDOW_DAYS,
  startOfDay,
  daysBetween,
  restoreDeadlineFor,
  rewardXpFor,
  nextMilestoneDay,
  restoreCostFor,
};
