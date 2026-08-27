'use strict';

require('dotenv').config();

const pool = require('../src/config/database');
const FORCE_FLAG = process.argv.includes('--force');

const escapeIdentifier = (value) => `'${String(value).replace(/"/g, '""')}'`;

const ensureSafeToRun = () => {
  if (process.env.NODE_ENV === 'production' && !FORCE_FLAG) {
    throw new Error('Refusing to wipe data in production. Re-run with --force.');
  }

  if (!FORCE_FLAG) {
    console.warn('[soft-delete-cleanup] This will permanent delete of soft-deleted records data from the current database. Re-run with --force to proceed.');
    process.exit(0);
  }
};

const getExistingTables = async (client) => {

  const { rows } = await client.query(
    `
    SELECT
        table_name
    FROM information_schema.columns
    WHERE column_name = $1
        AND table_schema = $2
    `,
    ['deleted_at', 'public']
  );

  return rows.map((row) => row.table_name);
};

const resetDatabase = async () => {
  ensureSafeToRun();

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existingTables = await getExistingTables(client);
    if (!existingTables.length) {
      throw new Error('No matching tables exist in the current database schema.');
    }
    console.log(`[soft-delete-cleanup] Starting permanent deletion of soft-deleted records from ${existingTables.length} tables...`);
    console.log(`[soft-delete-cleanup] Tables discovered from migrations: ${existingTables.join(', ')}`);

    const tableList = existingTables.map(t => `'${t}'`).join(', ');
    
    const query = `
                DO $$
                DECLARE
                    table_name TEXT;
                BEGIN
                    FOREACH table_name IN ARRAY ARRAY[${tableList}]
                    LOOP
                        EXECUTE format(
                            'DELETE FROM %I WHERE deleted_at IS NOT NULL',
                            table_name
                        );
                    END LOOP;
                END $$;
                `;

    await client.query(query);

    await client.query('COMMIT');
    console.log('[soft-delete-cleanup] permanent deletion of soft-deleted records completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[soft-delete-cleanup] permanent deletion of soft-deleted records failed:', error.message);
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
