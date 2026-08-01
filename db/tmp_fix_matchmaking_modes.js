'use strict';

const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const pool = new Pool({
  connectionString: process.env.DB_CONNECTION_STRING,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

(async () => {
  try {
    const before = await pool.query("SELECT mode, count(*) FROM game_matchmaking_ticket GROUP BY mode ORDER BY mode");
    console.log('before modes:', before.rows);

    await pool.query("ALTER TABLE game_matchmaking_ticket DROP CONSTRAINT IF EXISTS game_matchmaking_ticket_mode_check;");
    console.log('dropped old mode constraint');

    const updateRes = await pool.query("UPDATE game_matchmaking_ticket SET mode = 'AUTO' WHERE mode = 'QUICK'");
    console.log('updated rows:', updateRes.rowCount);

    const after = await pool.query("SELECT mode, count(*) FROM game_matchmaking_ticket GROUP BY mode ORDER BY mode");
    console.log('after modes:', after.rows);

    try {
      await pool.query("ALTER TABLE game_matchmaking_ticket ADD CONSTRAINT game_matchmaking_ticket_mode_check CHECK (mode IN ('AUTO', 'CUSTOM', 'TOURNAMENT'));");
      console.log('constraint updated');
    } catch (err) {
      console.error('constraint update failed:', err.message);
    }

    const constraints = await pool.query("SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'game_matchmaking_ticket'::regclass AND contype='c'");
    console.log('constraints now:', constraints.rows);
  } catch (err) {
    console.error('ERROR', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
