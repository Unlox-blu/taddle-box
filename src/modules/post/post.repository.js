'use strict';

const pool = require('../../config/database');
const PostModel = require('./post.model');


// Paginated list of users who liked a post, with the viewer's follow state
// on each liker (so the app can render Follow/Unfollow buttons in the list).
// Returns { rows, total } where rows are raw liker rows.
const findLikers = async (postId, currentUserId, limit, offset) => {
  try {
    const { rows } = await pool.query(
      `SELECT
          u.id,
          u.name,
          u.username,
          avatar_media.cloudfront_url AS avatar_url,
          EXISTS(
            SELECT 1 FROM followers f
            WHERE f.follower_id = $2 AND f.following_id = u.id AND f.status = 'active'
          ) AS is_following,
          EXISTS(
            SELECT 1 FROM followers f
            WHERE f.follower_id = u.id AND f.following_id = $2 AND f.status = 'active'
          ) AS is_follower,
          COUNT(*) OVER() AS total
       FROM ${PostModel.LIKES_TABLE} pl
       JOIN users u ON u.id = pl.user_id
       LEFT JOIN media AS avatar_media ON avatar_media.id = u.avatar_url
       WHERE pl.post_id = $1
         AND u.deleted_at IS NULL
       ORDER BY pl.created_at DESC
       LIMIT $3 OFFSET $4`,
      [postId, currentUserId, limit, offset]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

// Paginated list of users who reposted a post (a repost is a post row whose
// repost_of_id points at the original). Same response shape as findLikers so
// the app can reuse the same users-list modal for both.
const findReposters = async (postId, currentUserId, limit, offset) => {
  try {
    // MULTIPLE-REPOST semantics: one user can hold several repost rows of the
    // same post, so the list DEDUPES by user (newest repost wins) and the
    // total counts distinct users — a triple-reposter appears once, not thrice.
    const { rows } = await pool.query(
      `SELECT
          sub.id,
          sub.name,
          sub.username,
          avatar_media.cloudfront_url AS avatar_url,
          EXISTS(
            SELECT 1 FROM followers f
            WHERE f.follower_id = $2 AND f.following_id = sub.id AND f.status = 'active'
          ) AS is_following,
          EXISTS(
            SELECT 1 FROM followers f
            WHERE f.follower_id = sub.id AND f.following_id = $2 AND f.status = 'active'
          ) AS is_follower,
          COUNT(*) OVER() AS total
       FROM (
         SELECT DISTINCT ON (rp.author_id)
           u.id, u.name, u.username, u.avatar_url,
           rp.created_at AS last_reposted_at
         FROM ${PostModel.TABLE} rp
         JOIN users u ON u.id = rp.author_id
         WHERE rp.repost_of_id = $1
           AND rp.deleted_at IS NULL
           AND u.deleted_at IS NULL
         ORDER BY rp.author_id, rp.created_at DESC
       ) sub
       LEFT JOIN media AS avatar_media ON avatar_media.id = sub.avatar_url
       ORDER BY sub.last_reposted_at DESC
       LIMIT $3 OFFSET $4`,
      [postId, currentUserId, limit, offset]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const findById = async (postId, currentUserId = null) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
        ${PostModel.LIST_FIELDS},
        EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = $2) AS is_liked,
        EXISTS(SELECT 1 FROM bookmark bm WHERE bm.post_id = p.id AND bm.user_id = $2) AS is_bookmarked,
        EXISTS(
          SELECT 1 FROM xp_transactions xt
          WHERE xt.xp_id = (SELECT id FROM xp WHERE user_id = $2 LIMIT 1)
          AND xt.source_type = 'view_post_' || p.id
        ) AS is_xp_claimed,
        EXISTS(
          SELECT 1 FROM posts rp
          WHERE rp.repost_of_id = p.id AND rp.author_id = $2 AND rp.deleted_at IS NULL
        ) AS is_reposted,
        COALESCE(s.allow_reposts, TRUE) AS author_reposts_enabled,
        COALESCE(c.allow_reposts, TRUE) AS community_reposts_enabled,
        COALESCE(
            json_agg(
                json_build_object(
                    'id', m.id,
                    'media_type', m.media_type,
                    'cloudfront_url', m.cloudfront_url,
                    'width', m.width,
                    'height', m.height,
                    's3_key', m.s3_key,
                    'processing_status', m.processing_status
                ) ORDER BY m.created_at ASC 
            ) FILTER (WHERE m.deleted_at IS NULL AND m.processing_status = 'ready'), 
            '[]'::json
        ) AS media
        FROM posts p
        JOIN users u ON p.author_id = u.id
        LEFT JOIN media AS ua ON u.avatar_url = ua.id
        LEFT JOIN settings AS s ON s.user_id = u.id
        LEFT JOIN communities AS c ON p.community_id = c.id
        LEFT JOIN media AS ca ON c.avatar_url = ca.id
        LEFT JOIN media m ON p.id = m.post_id
        WHERE 
            p.id = $1
            AND p.deleted_at IS NULL
        GROUP BY p.id, u.id, ua.id, c.id, ca.id, s.user_id`,
      [postId, currentUserId]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};


// type: 'all' (default) | 'posts' (originals only) | 'reposts' (repost rows only)
const findManyByUser = async (authorId, limit, offset, currentUserId = null, type = 'all') => {
  try {
    const repostClause =
      type === 'reposts' ? `AND p.repost_of_id IS NOT NULL`
      : type === 'posts' ? `AND p.repost_of_id IS NULL`
      : '';
    const { rows } = await pool.query(
      `SELECT 
        ${PostModel.LIST_FIELDS},
        EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = $4) AS is_liked,
        EXISTS(SELECT 1 FROM bookmark bm WHERE bm.post_id = p.id AND bm.user_id = $4) AS is_bookmarked,
        EXISTS(
          SELECT 1 FROM xp_transactions xt
          WHERE xt.xp_id = (SELECT id FROM xp WHERE user_id = $4 LIMIT 1)
          AND xt.source_type = 'view_post_' || p.id
        ) AS is_xp_claimed,
        EXISTS(
          SELECT 1 FROM posts rp
          WHERE rp.repost_of_id = p.id AND rp.author_id = $4 AND rp.deleted_at IS NULL
        ) AS is_reposted,
        COALESCE(s.allow_reposts, TRUE) AS author_reposts_enabled,
        COALESCE(c.allow_reposts, TRUE) AS community_reposts_enabled,
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
    LEFT JOIN settings AS s ON s.user_id = u.id
    LEFT JOIN communities AS c ON p.community_id = c.id
    LEFT JOIN media AS ca ON c.avatar_url = ca.id
    LEFT JOIN media m ON p.id = m.post_id
    WHERE 
      p.author_id = $1
      AND p.deleted_at IS NULL
      ${repostClause}
    GROUP BY p.id, u.id, ua.id, c.id, ca.id, s.user_id
    ORDER BY p.created_at DESC
     LIMIT $2 OFFSET $3`,
      [authorId, limit, offset, currentUserId]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const findManyByCommunity = async (communityId, limit, offset, currentUserId = null) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${PostModel.LIST_FIELDS}, 
        EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = $4) AS is_liked,
        EXISTS(SELECT 1 FROM bookmark bm WHERE bm.post_id = p.id AND bm.user_id = $4) AS is_bookmarked,
        EXISTS(
          SELECT 1 FROM xp_transactions xt
          WHERE xt.xp_id = (SELECT id FROM xp WHERE user_id = $4 LIMIT 1)
          AND xt.source_type = 'view_post_' || p.id
        ) AS is_xp_claimed,
        EXISTS(
          SELECT 1 FROM posts rp
          WHERE rp.repost_of_id = p.id AND rp.author_id = $4 AND rp.deleted_at IS NULL
        ) AS is_reposted,
        COALESCE(s.allow_reposts, TRUE) AS author_reposts_enabled,
        COALESCE(c.allow_reposts, TRUE) AS community_reposts_enabled,
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
    LEFT JOIN settings AS s ON s.user_id = u.id
    LEFT JOIN communities AS c ON p.community_id = c.id
    LEFT JOIN media AS ca ON c.avatar_url = ca.id
    LEFT JOIN media m ON p.id = m.post_id
    WHERE 
      p.community_id = $1
      AND p.deleted_at IS NULL
      -- Private accounts: their posts only surface to the author or approved followers,
      -- even inside communities (the account's privacy is the audience boundary)
      AND (u.privacy = 'public' OR p.author_id = $4 OR EXISTS (
        SELECT 1 FROM followers f
        WHERE f.follower_id = $4 AND f.following_id = p.author_id AND f.status = 'active'
      ))
    GROUP BY p.id, u.id, ua.id, c.id, ca.id, s.user_id
    ORDER BY p.created_at DESC
     LIMIT $2 OFFSET $3`,
      [communityId, limit, offset, currentUserId]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const create = async (data) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { rows } = await client.query(
      `INSERT INTO ${PostModel.TABLE}
       (author_id, community_id, repost_of_id, title, content, media, tags, category, visibility, status, poll_data, link_data, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8::text[], $9, $10::varchar, $11, $12, CASE WHEN $10::varchar = 'published' THEN NOW() ELSE NULL END)
     RETURNING *`,
      [
        data.authorId,
        data.communityId || null,
        data.repostOfId || null,
        data.title || null,
        data.content || null,
        data.media ? JSON.stringify(data.media) : '[]',
        data.tags || [],
        data.category || [],
        data.visibility || 'public',
        data.status || 'published',
        data.pollData ? JSON.stringify(data.pollData) : null,
        data.linkData ? JSON.stringify(data.linkData) : null,
      ]
    );
    
    const post = rows[0];
    
    if (data.media && data.media.length > 0) {
      const mediaIds = data.media.map(m => typeof m === 'object' && m !== null ? m.id : m).filter(Boolean);
      if (mediaIds.length > 0) {
        await client.query(
          `UPDATE media SET post_id = $1 WHERE id = ANY($2::uuid[])`,
          [post.id, mediaIds]
        );
      }
    }
    
    await client.query('COMMIT');
    return post;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const update = async (postId, fields) => {
  try {
    const allowed = [
      'title',
      'content',
      'tags',
      'category',
      'visibility',
      'status',
      'poll_data',
      'link_data',
    ];
    const updates = [];
    const values = [];
    Object.entries(fields).forEach(([k, v]) => {
      const col = k.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowed.includes(col)) {
        if(Array.isArray(v) && v.length === 0) return
        values.push(v);
        updates.push(`${col} = $${values.length}`);
      }
    });
    if (!updates.length) return findById(postId);
    values.push(postId);
    const { rows } = await pool.query(
      `UPDATE ${PostModel.TABLE} SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
      values
    );
    return rows[0];
  } catch (error) {
    throw error;
  }
};

const softDelete = async (postId) => {
  try {
    await pool.query(`UPDATE ${PostModel.TABLE} SET deleted_at = NOW() WHERE id = $1`, [postId]);
  } catch (error) {
    throw error;
  }
};

const setRepostNull = async (repostId) => {
  try {
    await pool.query(`UPDATE ${PostModel.TABLE} SET repost_of_id = NULL WHERE repost_of_id = $1`, [repostId])
  } catch (error) {
    throw error
  }
}

// The repost row the current user created for a given original post (used for
// unrepost and to make reposting idempotent).
const findMyRepost = async (originalPostId, userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, community_id FROM ${PostModel.TABLE}
       WHERE repost_of_id = $1 AND author_id = $2 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [originalPostId, userId]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};

const hardDelete = async (postId) => {
  try {
    pool.query(`DELETE FROM ${PostModel.TABLE} WHERE id = $1`, [postId]);
  } catch (error) {
    throw error;
  }
};

const addLike = async (postId, userId) => {
  try {
    pool.query(
      `INSERT INTO ${PostModel.LIKES_TABLE} (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [postId, userId]
    );
  } catch (error) {
    throw error;
  }
};

const removeLike = async (postId, userId) => {
  try {
    pool.query(`DELETE FROM ${PostModel.LIKES_TABLE} WHERE post_id = $1 AND user_id = $2`, [
      postId,
      userId,
    ]);
  } catch (error) {
    throw error;
  }
};

const isLikedByUser = async (postId, userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM ${PostModel.LIKES_TABLE} WHERE post_id = $1 AND user_id = $2`,
      [postId, userId]
    );
    return rows.length > 0;
  } catch (error) {
    throw error;
  }
};

const incrementLikeCount = async (id) => {
  try {
    pool.query(`UPDATE ${PostModel.TABLE} SET likes_count    = likes_count    + 1 WHERE id = $1`, [
      id,
    ]);
  } catch (error) {
    throw error;
  }
};

const decrementLikeCount = async (id) => {
  try {
    pool.query(
      `UPDATE ${PostModel.TABLE} SET likes_count    = GREATEST(0, likes_count    - 1) WHERE id = $1`,
      [id]
    );
  } catch (error) {
    throw error;
  }
};

const incrementCommentCount = async (id) => {
  try {
    pool.query(`UPDATE ${PostModel.TABLE} SET comments_count = comments_count + 1 WHERE id = $1`, [
      id,
    ]);
  } catch (error) {
    throw error;
  }
};

const decrementCommentCount = async (id) => {
  try {
    pool.query(
      `UPDATE ${PostModel.TABLE} SET comments_count = GREATEST(0, comments_count - 1) WHERE id = $1`,
      [id]
    );
  } catch (error) {
    throw error;
  }
};

const incrementShareCount = async (id) => {
  try {
    await pool.query(`UPDATE ${PostModel.TABLE} SET shares_count   = shares_count   + 1 WHERE id = $1`, [
      id,
    ]);
  } catch (error) {
    throw error;
  }
};

const decrementShareCount = async (id) => {
  try {
    await pool.query(
      `UPDATE ${PostModel.TABLE} SET shares_count = GREATEST(0, shares_count - 1) WHERE id = $1`,
      [id]
    );
  } catch (error) {
    throw error;
  }
};

const incrementViewCount = async (id) => {
  try {
    pool.query(`UPDATE ${PostModel.TABLE} SET views_count    = views_count    + 1 WHERE id = $1`, [
      id,
    ]);
  } catch (error) {
    throw error;
  }
};

// Record a UNIQUE viewer for a post. The partial unique index on
// (post_id, user_id) makes re-views by the same user no-ops, so callers can
// bump views_count exactly when this returns true. Returns false for a repeat
// view by the same user.
const recordView = async (postId, userId) => {
  try {
    const { rowCount } = await pool.query(
      `INSERT INTO ${PostModel.VIEWS_TABLE} (post_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (post_id, user_id) WHERE user_id IS NOT NULL DO NOTHING`,
      [postId, userId || null]
    );
    return (rowCount || 0) > 0;
  } catch (error) {
    throw error;
  }
};

const search = async (query, limit, offset, currentUserId = null) => {
  try {
    const q = query || '';
    const { rows } = await pool.query(
      `SELECT ${PostModel.LIST_FIELDS}, COUNT(*) OVER() AS total,
        EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = $4) AS is_liked,
        EXISTS(SELECT 1 FROM bookmark bm WHERE bm.post_id = p.id AND bm.user_id = $4) AS is_bookmarked,
        EXISTS(
          SELECT 1 FROM xp_transactions xt
          WHERE xt.xp_id = (SELECT id FROM xp WHERE user_id = $4 LIMIT 1)
          AND xt.source_type = 'view_post_' || p.id
        ) AS is_xp_claimed,
        EXISTS(
          SELECT 1 FROM posts rp
          WHERE rp.repost_of_id = p.id AND rp.author_id = $4 AND rp.deleted_at IS NULL
        ) AS is_reposted,
        COALESCE(s.allow_reposts, TRUE) AS author_reposts_enabled,
        COALESCE(c.allow_reposts, TRUE) AS community_reposts_enabled
     FROM ${PostModel.TABLE} p
     JOIN users u ON u.id = p.author_id
     LEFT JOIN media AS ua ON u.avatar_url = ua.id
     LEFT JOIN settings AS s ON s.user_id = u.id
     LEFT JOIN communities AS c ON p.community_id = c.id
     LEFT JOIN media AS ca ON c.avatar_url = ca.id
     WHERE p.deleted_at IS NULL AND p.status = 'published' AND p.visibility = 'public'
       -- Private accounts: posts only surface to the author or approved followers
       AND (u.privacy = 'public' OR p.author_id = $4 OR EXISTS (
         SELECT 1 FROM followers f
         WHERE f.follower_id = $4 AND f.following_id = p.author_id AND f.status = 'active'
       ))
       AND ($1 = '' OR p.title ILIKE $1 OR p.content ILIKE $1)
     ORDER BY p.created_at DESC
     LIMIT $2 OFFSET $3`,
      [`%${q}%`, limit, offset, currentUserId]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  findById,
  findManyByUser,
  findManyByCommunity,
  create,
  update,
  softDelete,
  setRepostNull,
  hardDelete,
  findMyRepost,
  addLike,
  removeLike,
  isLikedByUser,
  incrementLikeCount,
  decrementLikeCount,
  incrementCommentCount,
  decrementCommentCount,
  incrementShareCount,
  decrementShareCount,
  incrementViewCount,
  recordView,
  search,
  findLikers,
  findReposters,
};
