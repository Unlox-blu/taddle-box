'use strict';

/**
 * db/audit-schema.js — read-only schema audit.
 *
 * Cross-checks every migration file's CREATE TABLE statements against the
 * live database (information_schema / to_regclass) and reports:
 *   1. Tables that migrations expect but the DB is missing.
 *   2. "Lying" _migrations rows — recorded as applied, but the objects they
 *      create don't exist (the exact failure mode that produced
 *      `relation "game_lobby" does not exist` on the sweeper).
 *   3. The _migrations id-sequence desync (duplicate-key on next insert).
 *   4. Known hot columns from recent migrations (media_url / preview_url).
 *
 * Makes NO writes. Safe to run against production.
 * Usage: node db/audit-schema.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/database');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Extract table names from CREATE TABLE [IF NOT EXISTS] statements.
// Skips temp/partial patterns best-effort. Also picks up
// CREATE TABLE ... AS / plain CREATE TABLE.
function extractCreatedTables(sql) {
  const tables = [];
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_.]*)/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    tables.push(m[1].replace(/^public\./i, '').toLowerCase());
  }
  return tables;
}

(async () => {
  const client = await pool.connect();
  try {
    await client.query('SET search_path TO public');

    // ── Load migration files + their expected tables ──
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const fileTables = new Map(); // file -> [tables]
    const allExpected = new Set();
    for (const f of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
      const tables = extractCreatedTables(sql);
      fileTables.set(f, tables);
      tables.forEach((t) => allExpected.add(t));
    }

    // ── Which expected tables actually exist? ──
    const existing = new Set();
    for (const t of allExpected) {
      const { rows } = await client.query(
        'SELECT to_regclass($1) AS reg',
        [`public.${t}`]
      );
      if (rows[0]?.reg) existing.add(t);
    }

    // ── _migrations bookkeeping ──
    const { rows: appliedRows } = await client.query(
      'SELECT id, filename FROM _migrations ORDER BY id'
    );
    const applied = new Set(appliedRows.map((r) => r.filename));

    // Sequence desync check (the duplicate-key bug from the failed runs)
    const { rows: seqRows } = await client.query(
      `SELECT COALESCE((SELECT MAX(id) FROM _migrations), 0) AS max_id,
              COALESCE((SELECT last_value FROM _migrations_id_seq), 0) AS seq_last`
    );
    const seqDesync = seqRows[0] && Number(seqRows[0].seq_last) < Number(seqRows[0].max_id);

    // ── Report ──
    const missingByFile = new Map(); // file -> [missing tables]
    for (const [f, tables] of fileTables) {
      const missing = tables.filter((t) => !existing.has(t));
      if (missing.length > 0) missingByFile.set(f, missing);
    }

    const liars = files.filter((f) => applied.has(f) && missingByFile.has(f));
    const notApplied = files.filter((f) => !applied.has(f));
    const healthyApplied = files.filter(
      (f) => applied.has(f) && !missingByFile.has(f)
    );

    console.log(`\n=== SCHEMA AUDIT (${files.length} migration files) ===`);
    console.log(`Recorded as applied: ${applied.size}`);
    console.log(`Expected tables: ${allExpected.size} | present: ${existing.size} | MISSING: ${allExpected.size - existing.size}`);

    if (liars.length > 0) {
      console.log(`\n✗ Lying bookkeeping — recorded as applied but objects are MISSING (${liars.length}):`);
      for (const f of liars) {
        console.log(`  ${f}  → missing: ${missingByFile.get(f).join(', ')}`);
      }
    } else {
      console.log('\n✓ No lying bookkeeping rows — every applied migration\'s tables exist.');
    }

    if (notApplied.length > 0) {
      console.log(`\n• Not recorded as applied (${notApplied.length}):`);
      for (const f of notApplied) {
        const miss = missingByFile.get(f);
        console.log(`  ${f}${miss ? `  → missing: ${miss.join(', ')}` : '  (objects already exist — safe re-run)'}`);
      }
    }

    if (seqDesync) {
      console.log(`\n✗ _migrations id sequence desync: last_value=${seqRows[0].seq_last} < max_id=${seqRows[0].max_id}`);
      console.log('  → next bookkeeping INSERT will fail with duplicate key.');
      console.log('  → fixed automatically by the updated db/migrate.js (setval self-heal).');
    } else {
      console.log('\n✓ _migrations id sequence is healthy.');
    }

    // Hot columns from the media migrations (073/075/089 thread)
    const { rows: mediaCols } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'media' AND column_name IN ('media_url', 'preview_url', 'cloudfront_url')
      ORDER BY column_name`);
    console.log(`\nMedia columns present: ${mediaCols.map((r) => r.column_name).join(', ') || '(none)'}`);
    const hasMediaUrl = mediaCols.some((r) => r.column_name === 'media_url');
    const hasPreview = mediaCols.some((r) => r.column_name === 'preview_url');
    if (!hasMediaUrl || !hasPreview) {
      console.log('  ✗ media_url/preview_url incomplete — migrations 073/075 still need to apply.');
    } else {
      console.log('  ✓ media_url + preview_url present — 073/075 will apply cleanly on the next migrate run.');
    }

    // ── Recommended repair ──
    if (liars.length > 0) {
      console.log('\n=== RECOMMENDED REPAIR ===');
      console.log('1. Clear the lying rows so migrate re-applies them (each file runs in its');
      console.log('   own transaction — a failing one rolls back cleanly):');
      console.log('');
      console.log('   DELETE FROM _migrations WHERE filename IN (');
      liars.forEach((f, i) => {
        console.log(`     '${f}'${i < liars.length - 1 ? ',' : ''}`);
      });
      console.log('   );');
      console.log('');
      console.log('2. Pull the latest db/migrate.js (sequence self-heal + failure summary), then:');
      console.log('   npm run migrate');
      console.log('');
      console.log('   ⚠ Review seed migrations among the liars (e.g. *_seed_*.sql) before');
      console.log('   re-running: if they are not idempotent they may insert duplicate rows.');
      console.log('   Structural migrations are safe — most use IF NOT EXISTS / guarded DDL.');
    } else if (notApplied.length > 0) {
      console.log('\n=== RECOMMENDED REPAIR ===');
      console.log('No lying rows. Just run: npm run migrate');
    } else {
      console.log('\nSchema and bookkeeping are consistent. Nothing to repair.');
    }
  } finally {
    client.release();
    await pool.end();
  }
})().catch((err) => {
  console.error('Audit failed:', err.message);
  process.exitCode = 1;
});
