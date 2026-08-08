require('dotenv').config();
const pool = require('../src/config/database');
(async () => {
  const { rows } = await pool.query(`
    SELECT r.id AS repost_id, r.author_id, r.repost_of_id, r.content,
           o.content AS orig_content
    FROM posts r
    JOIN posts o ON o.id = r.repost_of_id
    WHERE r.repost_of_id IS NOT NULL AND r.deleted_at IS NULL
    ORDER BY r.created_at DESC LIMIT 5`);
  console.log('REPOSTS:', JSON.stringify(rows, null, 1).slice(0, 1800));
  const Repo = require('../src/modules/post/post.repository');
  for (const r of rows) {
    const full = await Repo.findById(r.repost_of_id);
    console.log('\nORIGINAL findById:', JSON.stringify({ id: full?.id, content: full?.content, media: full?.media }, null, 1).slice(0, 1600));
    break;
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
