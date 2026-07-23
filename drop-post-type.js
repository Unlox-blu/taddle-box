const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_e67TkoahwlXz@ep-lingering-dawn-aonvhquy.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
});

async function dropColumn() {
  try {
    await client.connect();
    console.log("Connected to database");
    await client.query('ALTER TABLE posts DROP COLUMN IF EXISTS post_type');
    console.log("Column post_type dropped from posts table");
  } catch (error) {
    console.error("Error dropping column:", error);
  } finally {
    await client.end();
  }
}

dropColumn();
