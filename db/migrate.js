'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('../src/config/database');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const ensureMigrationsTable = async () => {
  // Ensure public schema is in search_path so CREATE TABLE works
  // even when the DB user has no default search_path (e.g. Neon, Supabase).
  await pool.query('SET search_path TO public');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         SERIAL PRIMARY KEY,
      filename   VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
};

const getApplied = async () => {
  const { rows } = await pool.query('SELECT filename FROM _migrations ORDER BY id');
  return new Set(rows.map((r) => r.filename));
};

const runMigrations = async () => {
  await ensureMigrationsTable();
  const applied = await getApplied();

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  ⏭  Skipping: ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Applied: ${file}`);
      count++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Failed: ${file} — ${err.message}`);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  console.log(`\nMigrations complete. ${count} new migration(s) applied.`);
};

const runSeed = async () => {
  const seedFile = path.join(__dirname, 'seeds', 'dev.seed.sql');
  if (!fs.existsSync(seedFile)) return console.warn('No seed file found.');
  const sql = fs.readFileSync(seedFile, 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Seed data applied.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
  } finally {
    client.release();
  }
};

(async () => {
  try {
    await runMigrations();
    if (process.argv.includes('--seed')) await runSeed();
  } finally {
    await pool.end();
  }
})();
