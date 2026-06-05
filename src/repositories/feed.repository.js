'use strict';

const pool = require('../config/database');
const PostModel = require('../models/post.model');

const getPersonalizedPosts = async (userId, followingIds, prefs, seenIds, limit, offset) => {
  try {
    const followingArr = followingIds.length > 0 ? followingIds : [null];
    const seenArr = seenIds.length > 0 ? seenIds : [null];

    const { rows } = await pool.query(
      `SELECT ${PostModel.LIST_FIELDS},
       (CASE WHEN p.author_id = ANY($2::uuid[]) THEN 10 ELSE 0 END
        + EXTRACT(EPOCH FROM (NOW() - p.published_at)) / -3600.0 * 0.5
        + p.likes_count * 0.3 + p.comments_count * 0.5) AS score,
       COUNT(*) OVER() AS total
     FROM ${PostModel.TABLE} p
     JOIN users u ON u.id = p.author_id
     WHERE p.deleted_at IS NULL
       AND p.status = 'published'
       AND p.visibility = 'public'
       AND p.id != ALL($3::uuid[])
       AND (p.author_id = ANY($2::uuid[]) OR p.author_id != $1)
     ORDER BY score DESC
     LIMIT $4 OFFSET $5`,
      [userId, followingArr, seenArr, limit, offset]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const recordInteraction = async (userId, postId, interactionType) => {
  try {
    await pool.query(
      `INSERT INTO post_interactions (user_id, post_id, interaction_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, post_id, interaction_type) DO UPDATE SET created_at = NOW()`,
      [userId, postId, interactionType]
    );
  } catch (error) {
    throw error;
  }
};

const getUserPreferences = async (userId) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM user_feed_preferences WHERE user_id = $1`, [
      userId,
    ]);
    return rows[0] || { categories: [], tags: [] };
  } catch (error) {
    throw error;
  }
};

const upsertUserPreferences = async (userId, categories, tags) => {
  try {
    await pool.query(
      `INSERT INTO user_feed_preferences (user_id, preferred_categories, preferred_tags)
     VALUES ($1, $2::text[], $3::text[])
     ON CONFLICT (user_id) DO UPDATE
       SET preferred_categories = $2::text[], preferred_tags = $3::text[], updated_at = NOW()`,
      [userId, categories, tags]
    );
  } catch (error) {
    throw error;
  }
};

module.exports = {
  getPersonalizedPosts,
  recordInteraction,
  getUserPreferences,
  upsertUserPreferences,
};
