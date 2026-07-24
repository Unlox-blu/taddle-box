require('dotenv').config();
const pool = require('./src/config/database');

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE settings 
      ADD COLUMN IF NOT EXISTS notif_xp BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS notif_withdraw BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS notif_promos BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS public_account BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS activity_status BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS allow_tagging BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS show_on_leaderboard BOOLEAN DEFAULT TRUE;
    `);
    console.log("Migration successful");
  } catch (e) {
    console.error(e.message);
  } finally {
    process.exit(0);
  }
}
migrate();
