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
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS latitude DECIMAL(9,6);`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS longitude DECIMAL(9,6);`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(20) CHECK (gender IN ('male', 'female', 'other'));`);
    console.log('Successfully altered users table');
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
