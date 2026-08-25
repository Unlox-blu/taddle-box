'use strict';

/**
 * Simple Node.js migration runner.
 *
 * Reads *.sql files from the migrations/ directory in lexicographic order,
 * tracks which have been applied in the schema_migrations table, and runs
 * any that haven't.
 *
 * Usage:
 *   node migrations/run.js              # apply pending migrations
 *   node migrations/run.js --dry-run    # show which migrations would run
 *   node migrations/run.js --status     # list applied vs pending
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs   = require('fs');
const path = require('path');
const pool = require('../src/config/database');

const MIGRATIONS_DIR = path.join(__dirname);

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          SERIAL PRIMARY KEY,
      filename    TEXT NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getApplied(client) {
  const { rows } = await client.query('SELECT filename FROM schema_migrations ORDER BY id');
  return new Set(rows.map(r => r.filename));
}

function getMigrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
}

async function run(dryRun = false, showStatus = false) {
  const client = await pool.connect();

  try {
    await ensureTable(client);
    const applied  = await getApplied(client);
    const allFiles = getMigrationFiles();

    const pending = allFiles.filter(f => !applied.has(f));

    if (showStatus) {
      console.log('\n=== Migration Status ===');
      for (const f of allFiles) {
        const tag = applied.has(f) ? '✅ applied' : '⏳ pending';
        console.log(`  ${tag}  ${f}`);
      }
      console.log(`\nTotal: ${allFiles.length}  Applied: ${applied.size}  Pending: ${pending.length}\n`);
      return;
    }

    if (pending.length === 0) {
      console.log('All migrations already applied.');
      return;
    }

    console.log(`\nApplying ${pending.length} migration(s)...\n`);

    for (const file of pending) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql      = fs.readFileSync(filePath, 'utf8');

      if (dryRun) {
        console.log(`[DRY RUN] Would apply: ${file}`);
        continue;
      }

      console.log(`Applying: ${file} ...`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
          [file]
        );
        await client.query('COMMIT');
        console.log(`  ✅ ${file} applied successfully`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ❌ ${file} FAILED: ${err.message}`);
        // Continue to next migration — the failed one is left as pending
      }
    }

    console.log('\nDone.\n');
  } finally {
    client.release();
    await pool.end();
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun    = args.includes('--dry-run');
const showStats = args.includes('--status');

run(dryRun, showStats).catch(err => {
  console.error('Migration runner failed:', err);
  process.exit(1);
});
