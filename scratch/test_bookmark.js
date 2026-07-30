require('dotenv').config({ path: ['.env.local', '.env'] });
const pool = require('../src/config/database');
const bookmarkRepo = require('../src/modules/bookmark/bookmark.repository');

async function test() {
  try {
    const { rows } = await pool.query('SELECT user_id, post_id FROM bookmark LIMIT 1');
    if (rows.length === 0) {
      console.log('No bookmarks in DB');
      return;
    }
    const userId = rows[0].user_id;
    console.log('Testing with user:', userId);

    const { bookmark, total } = await bookmarkRepo.findByUserId({userId, limit: 10, offset: 0});
    console.log('Bookmarks:', JSON.stringify(bookmark, null, 2));
    console.log('Total:', total);
  } catch (error) {
    console.error(error);
  } finally {
    process.exit(0);
  }
}
test();
