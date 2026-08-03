'use strict';

/**
 * One-off cleanup: backfill or remove orphaned `game_match` placeholder rows.
 *
 * Background
 * ----------
 * Before recordMatchHistory became an upsert, matchmaking created a placeholder
 * row per player (result = NULL, matchGroupId in metadata) that was never
 * updated when the match finished. Those NULL rows never show in the history
 * view (which filters result IS NOT NULL) but they inflate play-count stats and
 * leak into the matchmaking ticket's match payload. This script resolves them:
 *
 *   - BACKFILL rows whose outcome is recoverable from the engine's archived
 *     final state (game_matches.metadata->>'finalState'). In practice that is
 *     only the REALTIME games (scribble/tap-rush/...) whose pluginState holds
 *     per-player `scores` — the exact data completeGameSession uses to derive
 *     WIN/LOSS/DRAW (user score vs the best other/bot score). xp_earned stays 0
 *     because no XP was credited when these matches actually ran.
 *   - DELETE rows with no recoverable outcome: no matchGroupId, no archived
 *     finalState, or an archived state that never resolved a winner (turn-based
 *     matches abandoned mid-game — pluginState.winner is null and the top-level
 *     `winner` field is a constant "opponent" label, not a userId).
 *
 * The archived metadata->>'result' field is NOT used: _archiveMatch writes
 * `pluginState?.winner || 'DRAW'`, so it is 'DRAW' for every archived match and
 * does not reflect the true outcome.
 *
 * Usage
 * -----
 *   node db/cleanup_orphan_match_history.js            # dry-run (default)
 *   node db/cleanup_orphan_match_history.js --apply    # persist changes
 *
 * Idempotent: only touches rows where result IS NULL, so re-running is a no-op.
 */

const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const pool = new Pool({
  connectionString: process.env.DB_CONNECTION_STRING,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const APPLY = process.argv.includes('--apply');
const TURN_BASED = new Set(['chess', 'ludo', 'snake-ladder']);

/**
 * finalState is stored as a jsonb OBJECT, so the pg driver returns it
 * already-parsed. Accept both shapes (string for safety) and never treat an
 * object as corrupt.
 */
function parseFinalState(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Derive { result, score, duration } for a row from the archived final state.
 * Returns null when the outcome is genuinely undeterminable (abandoned turn-based
 * matches have no winner and no scores).
 */
function computeOutcome(game, finalState, userId) {
  const ps = finalState.pluginState || {};

  // Duration: prefer plugin timestamps, fall back to the wrapper's
  // startedAt/pausedAt (the archived end marker), then the game default.
  // Never fabricate a value — 0 is honest when nothing is recorded.
  let duration = 0;
  const start = Number(ps.startedAt) || Number(finalState.startedAt) || 0;
  const end = Number(ps.finishedAt) || Number(finalState.pausedAt) || 0;
  if (start && end) {
    duration = Math.max(1, Math.floor((end - start) / 1000));
  } else {
    duration = Number(game.metadata?.durationSeconds) || 0;
  }

  if (TURN_BASED.has(game.slug)) {
    // The engine records the winner as a userId in pluginState.winner. A null
    // winner (or the constant "opponent" label) means the match was abandoned
    // before a verdict — not recoverable.
    const winner = ps.winner;
    if (typeof winner !== 'string' || !winner) return null;
    const result = winner === userId ? 'WIN' : 'LOSS';
    const score = result === 'WIN' ? (Number(game.metadata?.winScore) || 1) : 0;
    return { result, score, duration };
  }

  // Realtime games: highest score wins (bot-filled matches resolve the same way
  // completeGameSession does — user score vs the best opponent/bot score).
  const scores = ps.scores || {};
  const myScore = Number(scores[userId]) || 0;
  const others = Object.entries(scores)
    .filter(([id]) => id !== userId)
    .map(([, v]) => Number(v) || 0);
  if (!others.length && myScore === 0) return null; // no score data at all
  const bestOther = others.length ? Math.max(...others) : 0;
  const result = myScore > bestOther ? 'WIN' : myScore < bestOther ? 'LOSS' : 'DRAW';
  return { result, score: myScore, duration };
}

async function main() {
  const { rows: orphans } = await pool.query(`
    SELECT gm.id, gm.user_id, gm.game_id,
           gm.metadata->>'matchGroupId' AS match_group_id,
           gm.created_at
    FROM game_match gm
    WHERE gm.result IS NULL
    ORDER BY gm.created_at`);
  console.log(`Found ${orphans.length} NULL-result placeholder row(s).`);

  const backfills = [];
  const deletions = [];

  for (const row of orphans) {
    if (!row.match_group_id) {
      // No way to link this placeholder to any real match → unresolvable.
      deletions.push({ ...row, reason: 'no matchGroupId' });
      continue;
    }

    const gmRes = await pool.query(
      `SELECT metadata FROM game_matches WHERE id = $1`,
      [row.match_group_id]
    );
    const gm = gmRes.rows[0];
    if (!gm || !gm.metadata || !gm.metadata.finalState) {
      deletions.push({ ...row, reason: 'no archived finalState' });
      continue;
    }

    const finalState = parseFinalState(gm.metadata.finalState);
    if (!finalState) {
      deletions.push({ ...row, reason: 'corrupt finalState' });
      continue;
    }
    if (finalState.status && finalState.status !== 'FINISHED') {
      deletions.push({ ...row, reason: `archived status ${finalState.status}` });
      continue;
    }

    const gameRes = await pool.query(`SELECT slug, metadata FROM game WHERE id = $1`, [row.game_id]);
    const game = gameRes.rows[0];
    if (!game) {
      deletions.push({ ...row, reason: 'game not found' });
      continue;
    }

    const outcome = computeOutcome(game, finalState, row.user_id);
    if (!outcome) {
      deletions.push({ ...row, reason: 'no recoverable outcome (abandoned/unresolved)' });
      continue;
    }

    backfills.push({ ...row, ...outcome, xpEarned: 0 });
  }

  console.log(`\nBackfill (${backfills.length}):`);
  for (const b of backfills) {
    console.log(
      `  ${b.id}  ${b.result.padEnd(4)} score=${b.score}  dur=${b.duration}s  (game ${b.game_id.slice(0, 8)}, ${b.match_group_id.slice(0, 8)})`
    );
  }
  console.log(`\nDelete (${deletions.length}):`);
  for (const d of deletions) {
    console.log(`  ${d.id}  (${d.reason})`);
  }

  if (!APPLY) {
    console.log(`\nDRY-RUN — no changes made. Re-run with --apply to persist.`);
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const b of backfills) {
      await client.query(
        `UPDATE game_match
         SET result = $1, score = $2, duration = $3, xp_earned = $4, updated_at = NOW()
         WHERE id = $5 AND result IS NULL`,
        [b.result, b.score, b.duration, b.xpEarned, b.id]
      );
    }
    for (const d of deletions) {
      await client.query(`DELETE FROM game_match WHERE id = $1 AND result IS NULL`, [d.id]);
    }
    await client.query('COMMIT');
    console.log(`\nAPPLIED: backfilled ${backfills.length}, deleted ${deletions.length}.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('FATAL', err.message);
  process.exitCode = 1;
  return pool.end();
});
