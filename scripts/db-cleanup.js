#!/usr/bin/env node
'use strict';

/**
 * Clean up old tournament data from Neon DB.
 * 
 * Usage:
 *   node scripts/db-cleanup.js              # dry run (shows what would be deleted)
 *   node scripts/db-cleanup.js --execute    # actually delete
 * 
 * Deletes:
 *   - Completed/cancelled tournament entries older than 30 days
 *   - Completed/cancelled tournaments older than 30 days
 *   - Old event_outbox rows (processed, older than 7 days)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DB_CONNECTION_STRING,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

const DRY_RUN = !process.argv.includes('--execute');
const TOURNAMENT_RETENTION = '30 days';
const OUTBOX_RETENTION = '7 days';
const BATCH_SIZE = 1000;

async function countDead(sql, params) {
  const { rows } = await pool.query(sql, params);
  return parseInt(rows[0].count, 10);
}

async function deleteBatch(tableName, condition) {
  let totalDeleted = 0;
  let batch;

  do {
    const result = await pool.query(
      `DELETE FROM ${tableName}
       WHERE ctid IN (
         SELECT ctid FROM ${tableName}
         WHERE ${condition}
         LIMIT ${BATCH_SIZE}
       )`
    );
    batch = result.rowCount;
    totalDeleted += batch;
    if (batch > 0) process.stdout.write(`\r   Deleted ${totalDeleted} rows...`);
  } while (batch === BATCH_SIZE);

  console.log(`\r   Deleted ${totalDeleted} rows from ${tableName}         `);
  return totalDeleted;
}

async function main() {
  console.log(DRY_RUN ? '🔍 DRY RUN — no data will be deleted\n' : '⚠️  EXECUTE MODE — data WILL be deleted\n');

  // ── 1. Tournament entries for old tournaments ──────────────────
  const oldEntryCount = await countDead(`
    SELECT COUNT(*) AS count
    FROM game_tournament_entry e
    JOIN game_tournament t ON t.id = e.tournament_id
    WHERE t.ends_at < NOW() - INTERVAL '7 days'
  `);

  console.log(`📦 Old tournament entries (>7 days): ${oldEntryCount.toLocaleString()}`);

  if (oldEntryCount > 0 && !DRY_RUN) {
    await deleteBatch(
      'game_tournament_entry',
      `tournament_id IN (
        SELECT id FROM game_tournament
        WHERE ends_at < NOW() - INTERVAL '7 days'
      )`
    );
  }

  // ── 2. ALL old tournaments (ACTIVE + COMPLETED older than 7 days) ──
  const oldTournamentCount = await countDead(`
    SELECT COUNT(*) AS count
    FROM game_tournament
    WHERE ends_at < NOW() - INTERVAL '7 days'
  `);

  console.log(`📦 Old tournaments (>7 days, all statuses): ${oldTournamentCount.toLocaleString()}`);

  if (oldTournamentCount > 0 && !DRY_RUN) {
    await deleteBatch(
      'game_tournament',
      `ends_at < NOW() - INTERVAL '7 days'`
    );
  }

  // ── 3. Old event outbox rows ─────────────────────────────────────
  const oldOutboxCount = await countDead(`
    SELECT COUNT(*) AS count
    FROM event_outbox
    WHERE processed_at IS NOT NULL
      AND processed_at < NOW() - INTERVAL '${OUTBOX_RETENTION}'
  `);

  console.log(`📦 Old processed outbox events (>${OUTBOX_RETENTION}): ${oldOutboxCount.toLocaleString()}`);

  if (oldOutboxCount > 0 && !DRY_RUN) {
    await deleteBatch(
      'event_outbox',
      `processed_at IS NOT NULL AND processed_at < NOW() - INTERVAL '${OUTBOX_RETENTION}'`,
      [],
      OUTBOX_RETENTION
    );
  }

  // ── 4. Old completed game sessions ───────────────────────────────
  const oldSessionCount = await countDead(`
    SELECT COUNT(*) AS count
    FROM game_sessions
    WHERE status IN ('COMPLETED', 'EXPIRED')
      AND completed_at < NOW() - INTERVAL '${TOURNAMENT_RETENTION}'
  `);

  console.log(`📦 Old game sessions (>${TOURNAMENT_RETENTION}): ${oldSessionCount.toLocaleString()}`);

  if (oldSessionCount > 0 && !DRY_RUN) {
    await deleteBatch(
      'game_sessions',
      `status IN ('COMPLETED', 'EXPIRED') AND completed_at < NOW() - INTERVAL '${TOURNAMENT_RETENTION}'`,
      [],
      TOURNAMENT_RETENTION
    );
  }

  // ── 5. VACUUM if we deleted anything ─────────────────────────────
  const totalDeleted = oldEntryCount + oldTournamentCount + oldOutboxCount + oldSessionCount;

  if (!DRY_RUN && totalDeleted > 0) {
    console.log('\n🧹 Running VACUUM ANALYZE on cleaned tables...');
    const tables = ['game_tournament', 'game_tournament_entry', 'event_outbox', 'game_sessions'];
    for (const t of tables) {
      await pool.query(`VACUUM (ANALYZE) ${t}`);
      console.log(`   ✅ VACUUM ${t}`);
    }
  }

  // ── 6. Show final size ──────────────────────────────────────────
  const [dbSize] = await pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`);
  console.log(`\n📊 Database size: ${dbSize.size}`);

  if (DRY_RUN && totalDeleted > 0) {
    console.log(`\n💡 Run with --execute to actually delete ${totalDeleted.toLocaleString()} rows`);
  } else if (totalDeleted === 0) {
    console.log('\n✅ Nothing to clean up');
  }

  await pool.end();
}

main().catch(err => {
  console.error('❌ Cleanup failed:', err.message);
  process.exit(1);
});
