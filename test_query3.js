const pool = require('./src/config/database');
async function test() {
  try {
    const { rows } = await pool.query('SELECT * FROM client_registry WHERE user_id = $1', ['a1df7aa5-435c-4fda-90af-8a4c0405b6a0']);
    console.dir(rows);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
test();
