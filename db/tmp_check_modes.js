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
    const modes = await pool.query('SELECT mode, count(*) FROM game_matchmaking_ticket GROUP BY mode ORDER BY mode');
    console.log('modes:', modes.rows);
    const bad = await pool.query("SELECT id, mode FROM game_matchmaking_ticket WHERE mode NOT IN ('AUTO','CUSTOM','TOURNAMENT') ORDER BY mode LIMIT 50");
    console.log('bad rows:', bad.rows);
    const cons = await pool.query("SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'game_matchmaking_ticket'::regclass AND contype='c'");
    console.log('constraints:', cons.rows);
  } catch (err) {
    console.error('ERROR', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
