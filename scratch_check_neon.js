const { Pool } = require('pg');
require('dotenv').config({ path: 'd:/Workspace/Unlox/code/taddle/taddle-box/.env' });

const pool = new Pool({
  connectionString: process.env.DB_CONNECTION_STRING,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const { rows } = await pool.query(`SELECT id, email, phone_number, country_code FROM users WHERE id = '362ebbd2-748d-48a6-a46c-9cda81499c2c';`);
  console.log('User:', rows);
  pool.end();
}

run();
