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
    const res = await pool.query("SELECT mode, count(*) FROM game_match GROUP BY mode ORDER BY mode");
    console.log('game_match modes:', res.rows);
    const bad = await pool.query("SELECT id, mode FROM game_match WHERE mode NOT IN ('AUTO','CUSTOM','TOURNAMENT') ORDER BY mode, id LIMIT 50");
    console.log('bad game_match rows:', bad.rows);
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
