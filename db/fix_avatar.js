require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_avatar_url_fkey;`);
    await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_banner_url_fkey;`);
    await pool.query(`ALTER TABLE users ALTER COLUMN avatar_url TYPE TEXT USING avatar_url::text;`);
    await pool.query(`ALTER TABLE users ALTER COLUMN banner_url TYPE TEXT USING banner_url::text;`);
    console.log('Successfully altered avatar_url to TEXT');
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
