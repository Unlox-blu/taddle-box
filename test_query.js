require('dotenv').config();
const pool = require('./src/config/database');

async function test() {
  try {
    const userId = 'a1df7aa5-435c-4fda-90af-8a4c0405b6a0'; // Using the user's UUID
    const searchTerm = '';
    const limit = 20;
    const offset = 0;
    
    console.log("Running query...");
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.username,
              au.cloudfront_url AS avatar_url,
              EXISTS(
                SELECT 1 FROM conversations c
                JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = $1
                JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = u.id
              ) AS has_conversation
       FROM users u
       LEFT JOIN media au ON au.id = u.avatar_url
       WHERE u.id != $1
         AND EXISTS (
           SELECT 1 FROM followers f1
           WHERE f1.follower_id = $1 AND f1.following_id = u.id AND f1.status = 'active'
         )
         AND EXISTS (
           SELECT 1 FROM followers f2
           WHERE f2.follower_id = u.id AND f2.following_id = $1 AND f2.status = 'active'
         )
         AND ($2 = '' OR u.name ILIKE $2 OR u.username ILIKE $2)
       ORDER BY u.name
       LIMIT $3 OFFSET $4`,
      [userId, searchTerm, limit, offset]
    );
    console.log("Success! Rows:", rows.length);
  } catch (err) {
    console.error("Error executing query:");
    console.error(err.message);
  } finally {
    pool.end();
  }
}

test();
