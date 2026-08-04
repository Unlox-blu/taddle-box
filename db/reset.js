'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('../src/config/database');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const FORCE_FLAG = process.argv.includes('--force');

const TABLE_PATTERN = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(?:public\.)?)("([^"]+)"|([a-zA-Z_][\w$]*))\s*\(/gi;

const escapeIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

const getTablesFromMigrations = () => {
  const migrationFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const tables = new Set();

  for (const file of migrationFiles) {
    const fullPath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    const matches = sql.matchAll(TABLE_PATTERN);

    for (const match of matches) {
      const tableName = match[2] || match[3];
      if (tableName) tables.add(tableName);
    }
  }

  return Array.from(tables).sort();
};

const ensureSafeToRun = () => {
  if (process.env.NODE_ENV === 'production' && !FORCE_FLAG) {
    throw new Error('Refusing to wipe data in production. Re-run with --force.');
  }

  if (!FORCE_FLAG) {
    console.warn('[reset-db] This will delete all data from the current database. Re-run with --force to proceed.');
    process.exit(0);
  }
};

const getExistingTables = async (client, tableNames) => {
  if (!tableNames.length) {
    return [];
  }

  const { rows } = await client.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = ANY($2::text[])
        AND table_type = $3
    `,
    ['public', tableNames, 'BASE TABLE']
  );

  return rows.map((row) => row.table_name);
};

const resetDatabase = async () => {
  ensureSafeToRun();

  const tables = getTablesFromMigrations();
  if (!tables.length) {
    throw new Error('No tables were discovered from the migration files.');
  }

  const client = await pool.connect();

  try {
    console.log(`[reset-db] Starting database reset for ${tables.length} discovered tables...`);
    console.log(`[reset-db] Tables discovered from migrations: ${tables.join(', ')}`);

    await client.query('BEGIN');

    const existingTables = await getExistingTables(client, tables);
    if (!existingTables.length) {
      throw new Error('No matching tables exist in the current database schema.');
    }

    const truncateList = existingTables.map(escapeIdentifier).join(', ');
    console.log(`[reset-db] Truncating ${existingTables.length} existing tables with RESTART IDENTITY and CASCADE...`);
    await client.query(`TRUNCATE TABLE ${truncateList} RESTART IDENTITY CASCADE`);

    await client.query('COMMIT');
    console.log('[reset-db] Database reset completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[reset-db] Database reset failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

(async () => {
  try {
    await resetDatabase();
  } catch (error) {
    process.exitCode = 1;
  }
})();
