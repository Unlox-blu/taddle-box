'use strict';

const pool = require('../../config/database');
const SearchModel = require('./search.model');




const searchUser = async (query, limit, offset) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${SearchModel.USER_FIELDS}, COUNT(*) OVER() AS total
       FROM ${SearchModel.USER_TABLE} u
       LEFT JOIN media AS ua ON u.avatar_url = ua.id
     WHERE u.deleted_at IS NULL AND u.is_active = TRUE AND u.is_banned = FALSE
       AND ($1 = '' OR username ILIKE $1 OR name ILIKE $1)
     ORDER BY u.follower_count DESC
     LIMIT $2 OFFSET $3`,
      [`%${query}%`, limit, offset]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const searchCommunity = async (query, filter, limit, offset) => {
  try {
    const q = query || '';
    const category = filter || null;
    const { rows } = await pool.query(
      `SELECT ${SearchModel.COMMUNITY_FIELDS}, COUNT(*) OVER() AS total
        FROM ${SearchModel.COMMUNITY_TABLE} c
        LEFT JOIN media AS ca ON c.avatar_url = ca.id
        WHERE c.deleted_at IS NULL AND c.is_active = TRUE AND c.privacy IN ('public', 'restricted')
        AND ($1 = '' OR c.name ILIKE $1 OR c.description ILIKE $1)
        AND ($2::text IS NULL OR $2 = ANY(c.category))
        ORDER BY c.member_count DESC
        LIMIT $3 OFFSET $4`,
      [`%${q}%`, category, limit, offset]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const searchEvent = async (query, filter, limit, offset) => {
  try {
    const q = query || '';
    const eventType = filter || null;
    const { rows } = await pool.query(
      `SELECT ${SearchModel.EVENT_FIELDS}, COUNT(*) OVER() AS total
     FROM ${SearchModel.EVENT_TABLE}
     WHERE deleted_at IS NULL AND status IN ('upcoming', 'ongoing')
       AND ($1 = '' OR title ILIKE $1 OR description ILIKE $1)
       AND ($2::text IS NULL OR event_type = $2)
     ORDER BY start_time ASC
     LIMIT $3 OFFSET $4`,
      [`%${q}%`, eventType, limit, offset]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const searchPost = async (query, limit, offset, userId = null) => {
  try {
    const q = query || '';
    const { rows } = await pool.query(
      `SELECT 
              ${SearchModel.POST_FIELDS},
              COALESCE(
                  json_agg(
                      json_build_object(
                          'id', m.id,
                          'media_type', m.media_type,
                          'cloudfront_url', m.cloudfront_url,
                          'width', m.width,
                          'height', m.height,
                          'processing_status', m.processing_status
                      ) ORDER BY m.created_at ASC
                  ) FILTER (WHERE m.id IS NOT NULL AND m.deleted_at IS NULL), 
                  '[]'::json
              ) AS media, COUNT(*) OVER() AS total
          FROM posts p
          JOIN users u ON p.author_id = u.id
          LEFT JOIN media AS ua ON u.avatar_url = ua.id
          LEFT JOIN communities AS c ON p.community_id = c.id
          LEFT JOIN media AS ca ON c.avatar_url = ca.id
          LEFT JOIN media m ON p.id = m.post_id
          WHERE 
            p.deleted_at IS NULL AND p.status = 'published' 
            AND (p.visibility = 'public' OR (p.visibility = 'community' AND c.privacy != 'private'))
            AND ($1 = '' OR p.title ILIKE $1 OR p.content ILIKE $1)
            -- Private accounts: posts only surface to the author or approved followers
            AND (u.privacy = 'public' OR p.author_id = $4 OR EXISTS (
              SELECT 1 FROM followers f
              WHERE f.follower_id = $4 AND f.following_id = p.author_id AND f.status = 'active'
            ))
          GROUP BY p.id, u.id, ua.id, c.id, ca.id
          ORDER BY CASE WHEN $1 = '' THEN (p.likes_count + p.comments_count) END DESC NULLS LAST, p.created_at DESC
           LIMIT $2 OFFSET $3`,
      [`%${q}%`, limit, offset, userId]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const searchGame = async (query, limit, offset) => {
  try {
    const q = query || '';
    const { rows } = await pool.query(
      `SELECT ${SearchModel.GAME_FIELDS}, COUNT(*) OVER() AS total
       FROM ${SearchModel.GAME_TABLE}
       WHERE is_active = TRUE
         AND ($1 = '' OR name ILIKE $1 OR slug ILIKE $1)
       ORDER BY CASE WHEN $1 = '' THEN (metadata->>'maxXp')::int END DESC NULLS LAST, created_at DESC
       LIMIT $2 OFFSET $3`,
      [`%${q}%`, limit, offset]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const getHashtags = async (q = '') => {
  try {
    const { rows } = await pool.query(
      `SELECT LOWER(t.tag) AS hashtag, COUNT(*) AS count
       FROM ${SearchModel.POST_TABLE} p
       JOIN users u ON u.id = p.author_id
       CROSS JOIN LATERAL unnest(p.tags) AS t(tag)
       WHERE p.deleted_at IS NULL 
         AND p.status = 'published' 
         AND p.visibility = 'public' 
         AND u.privacy = 'public'
         AND p.tags IS NOT NULL
         AND LOWER(t.tag) ILIKE $1
       GROUP BY LOWER(t.tag)
       ORDER BY count DESC, hashtag ASC
       LIMIT 15`,
       [`%${q}%`]
    );
    return rows.map(r => r.hashtag);
  } catch (error) {
    throw error;
  }
};

module.exports = {
    searchUser, searchCommunity, searchEvent, searchPost, searchGame, getHashtags
}