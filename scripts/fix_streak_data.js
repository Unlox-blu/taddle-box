'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// TEMP one-off cleanup: repair legacy streak data from BEFORE the streak
// revamp (duplicate rows, stale end_dates, dead rows, task-board alias).
//
// The new streak service (streak.service.js) is the single source of truth
// for how a streak is read/advanced; this script aligns the DATA to exactly
// what that state machine expects, importing the SAME formulas from
// streak.rules.js so the cleanup can never drift from the runtime code.
//
// What it does per user:
//   1. De-dupe: keep only the newest streak row, delete older ones.
//   2. Normalize the kept row with the SSOT state-machine rules:
//        - dead streak (restore window passed / never frozen + expired)
//          → replaced with a fresh Day-1 row anchored to TODAY
//        - first miss (gap >= 2 days, no deadline) → frozen: restore
//          deadline opened exactly like #evaluate would
//        - otherwise → count clamped to >= 1, dates left intact
//   3. Sync tasks.streak (the old task-board alias) to the real count;
//      users with no streak row get tasks.streak = 0.
//
// Run ONCE from the taddle-box root, then delete this file:
//   node scripts/fix_streak_data.js
// Idempotent — safe to re-run.
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const pool = require('../src/config/database');
const { daysBetween, restoreDeadlineFor } = require('../src/modules/streak/streak.rules');

// Local-day YYYY-MM-DD key — the state machine's day math is local, so the
// script must anchor "today" the same way (never UTC).
const localDateKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

async function main() {
  const client = await pool.connect();
  const stats = { users: 0, rowsDeleted: 0, resets: 0, freezes: 0, clamped: 0, taskSynced: 0, taskZeroed: 0 };
  try {
    const now = new Date();
    const today = localDateKey(now);

    const { rows: users } = await client.query(
      'SELECT DISTINCT user_id FROM streak ORDER BY user_id'
    );

    for (const { user_id: userId } of users) {
      const { rows } = await client.query(
        'SELECT * FROM streak WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      if (rows.length === 0) continue;

      await client.query('BEGIN');
      try {
        stats.users += 1;

        // 1) De-dupe — the old code INSERTed a new row on every broken streak
        // and never deleted the old ones, so users can hold several rows.
        const keep = rows[0];
        if (rows.length > 1) {
          const oldIds = rows.slice(1).map((r) => r.id);
          const del = await client.query(
            'DELETE FROM streak WHERE id = ANY($1::uuid[])',
            [oldIds]
          );
          stats.rowsDeleted += del.rowCount;
        }

        const countRaw = parseInt(keep.streak_count, 10);
        const count = Math.max(1, Number.isFinite(countRaw) ? countRaw : 1);
        const endDate = new Date(keep.end_date);
        const gap = daysBetween(endDate, now);

        // 2) Normalize per the SSOT state machine (#evaluate):
        //    - restore window already expired → dead
        //    - first miss (gap >= 2, never frozen) → freeze (or dead if the
        //      window already passed without ever being recorded)
        const deadlineSet = keep.restore_deadline ? new Date(keep.restore_deadline) : null;
        const windowExpired = deadlineSet ? now >= deadlineSet : false;

        if (windowExpired || (!deadlineSet && gap >= 2 && now >= restoreDeadlineFor(endDate))) {
          // Dead streak → fresh Day 1 anchored to today. Remove the old row
          // and insert a clean one (mirrors reset() in the service).
          await client.query('DELETE FROM streak WHERE id = $1', [keep.id]);
          await client.query(
            'INSERT INTO streak (user_id, start_date, end_date, streak_count) VALUES ($1, $2::date, $2::date, 1)',
            [userId, today]
          );
          stats.resets += 1;
          await client.query(
            'UPDATE task SET streak = 1, updated_at = NOW() WHERE user_id = $1',
            [userId]
          );
          stats.taskSynced += 1;
          await client.query('COMMIT');
          continue;
        }

        if (!deadlineSet && gap >= 2) {
          // First miss — open the 24h restore window exactly like freeze().
          await client.query(
            'UPDATE streak SET restore_deadline = $2, updated_at = NOW() WHERE id = $1',
            [keep.id, restoreDeadlineFor(endDate)]
          );
          stats.freezes += 1;
        } else if (count !== countRaw) {
          // Alive streak — clamp the count so it can never read as 0/null.
          await client.query(
            'UPDATE streak SET streak_count = $2, updated_at = NOW() WHERE id = $1',
            [keep.id, count]
          );
          stats.clamped += 1;
        }

        // 3) Sync the task-board alias to the real count.
        const finalCount = count;
        await client.query(
          'UPDATE task SET streak = $2, updated_at = NOW() WHERE user_id = $1',
          [userId, finalCount]
        );
        stats.taskSynced += 1;

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }

    // Users with no streak row at all: kill any stale task-board streak
    // (the old code used to write 1 there without a real streak).
    const zeroed = await client.query(
      `UPDATE task SET streak = 0, updated_at = NOW()
       WHERE streak > 0 AND NOT EXISTS (SELECT 1 FROM streak s WHERE s.user_id = task.user_id)`
    );
    stats.taskZeroed = zeroed.rowCount;
  } finally {
    client.release();
  }

  console.log('Streak data cleanup complete:');
  console.log(JSON.stringify(stats, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error('Streak cleanup FAILED:', e);
  process.exit(1);
});
