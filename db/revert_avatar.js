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
    await pool.query(`UPDATE users SET avatar_url = NULL, banner_url = NULL;`);
    await pool.query(`ALTER TABLE users ALTER COLUMN avatar_url TYPE UUID USING avatar_url::uuid;`);
    await pool.query(`ALTER TABLE users ALTER COLUMN banner_url TYPE UUID USING banner_url::uuid;`);
    await pool.query(`ALTER TABLE users ADD CONSTRAINT users_avatar_url_fkey FOREIGN KEY (avatar_url) REFERENCES media(id) ON DELETE SET NULL;`);
    await pool.query(`ALTER TABLE users ADD CONSTRAINT users_banner_url_fkey FOREIGN KEY (banner_url) REFERENCES media(id) ON DELETE SET NULL;`);
    console.log('Successfully reverted avatar_url and banner_url to UUID with foreign keys.');
  } catch (e) {
    console.error('Error during DB revert:', e);
  } finally {
    pool.end();
  }
}
run();
