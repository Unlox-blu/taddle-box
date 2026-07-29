const { Pool } = require('pg');
require('dotenv').config({ path: 'd:/Workspace/Unlox/code/taddle/taddle-box/.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  const { rows } = await pool.query(`SELECT email, phone_number, country_code FROM users LIMIT 5;`);
  console.log('Users:', rows);
  pool.end();
}

run();
