require('dotenv').config({ path: 'd:/Workspace/Unlox/code/taddle/taddle-box/.env' });
const pool = require('d:/Workspace/Unlox/code/taddle/taddle-box/src/config/database');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("ALTER TABLE game_lobby ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb");
    await client.query("ALTER TABLE game_lobby DROP CONSTRAINT IF EXISTS game_lobby_status_check CASCADE");
    await client.query(`
      ALTER TABLE game_lobby
      ADD CONSTRAINT game_lobby_status_check
      CHECK (status IN ('WAITING', 'LOCKED', 'READY', 'MATCHED', 'COMPLETED', 'CANCELLED', 'TIMED_OUT'))
    `);
    await client.query('COMMIT');
    console.log('Migration successful');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Migration failed', e);
  } finally {
    client.release();
    process.exit(0);
  }
}
migrate();
