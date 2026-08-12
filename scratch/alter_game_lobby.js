require('dotenv').config({ path: 'd:/Workspace/Unlox/code/taddle/taddle-box/.env' });
const pool = require('d:/Workspace/Unlox/code/taddle/taddle-box/src/config/database');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Add expires_at
    await client.query('ALTER TABLE game_lobby ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ');
    
    // Update check constraint
    try {
      await client.query('ALTER TABLE game_lobby DROP CONSTRAINT game_lobby_status_check');
    } catch (e) {
      console.log("Could not drop constraint (might not exist or different name)", e.message);
      const res = await client.query(`
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'game_lobby'::regclass AND contype = 'c'
      `);
      for (const row of res.rows) {
         await client.query(`ALTER TABLE game_lobby DROP CONSTRAINT ${row.conname}`);
      }
    }
    
    await client.query(`
      ALTER TABLE game_lobby
      ADD CONSTRAINT game_lobby_status_check
      CHECK (status IN ('WAITING', 'LOCKED', 'READY', 'MATCHED', 'COMPLETED', 'CANCELLED'))
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
