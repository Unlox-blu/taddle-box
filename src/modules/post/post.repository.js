'use strict';

const pool = require('../../config/database');
const PostModel = require('./post.model');


// Paginated list of users who liked a post, with the viewer's follow state
// on each liker (so the app can render Follow/Unfollow buttons in the list).
// Returns { rows, total } where rows are raw liker rows.
const findLikers = async (postId, currentUserId, limit, offset, search = '') => {
  try {
    const q = search ? `%${search}%` : '';
    const { rows } = await pool.query(
      `SELECT
          u.id,
          u.name,
          u.username,
          u.privacy,
          avatar_media.cloudfront_url AS avatar_url,
          EXISTS(
            SELECT 1 FROM followers f
            WHERE f.follower_id = $2 AND f.following_id = u.id AND f.status = 'active'
          ) AS is_following,
          EXISTS(
            SELECT 1 FROM followers f
            WHERE f.follower_id = u.id AND f.following_id = $2 AND f.status = 'active'
          ) AS is_follower,
          -- Viewer's follow relationship with this user (NULL = none) so the
          -- app can distinguish Follow / Following / Requested states.
          (SELECT f2.status FROM followers f2
            WHERE f2.follower_id = $2 AND f2.following_id = u.id
            LIMIT 1) AS follow_status,
          COUNT(*) OVER() AS total
       FROM ${PostModel.LIKES_TABLE} pl
       JOIN users u ON u.id = pl.user_id
       LEFT JOIN media AS avatar_media ON avatar_media.id = u.avatar_url
       WHERE pl.post_id = $1
         AND u.deleted_at IS NULL
         AND ($5 = '' OR u.username ILIKE $5 OR u.name ILIKE $5)
       ORDER BY pl.created_at DESC
       LIMIT $3 OFFSET $4`,
      [postId, currentUserId, limit, offset, q]
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
const findReposters = async (postId, currentUserId, limit, offset, search = '') => {
  try {
    const q = search ? `%${search}%` : '';
    // MULTIPLE-REPOST semantics: one user can hold several repost rows of the
    // same post, so the list DEDUPES by user (newest repost wins) and the
    // total counts distinct users — a triple-reposter appears once, not thrice.
    const { rows } = await pool.query(
      `SELECT
          sub.id,
          sub.name,
          sub.username,
          sub.privacy,
          avatar_media.cloudfront_url AS avatar_url,
          EXISTS(
            SELECT 1 FROM followers f
            WHERE f.follower_id = $2 AND f.following_id = sub.id AND f.status = 'active'
          ) AS is_following,
          EXISTS(
            SELECT 1 FROM followers f
            WHERE f.follower_id = sub.id AND f.following_id = $2 AND f.status = 'active'
          ) AS is_follower,
          -- Viewer's follow relationship with this user (NULL = none) so the
          -- app can distinguish Follow / Following / Requested states.
          (SELECT f2.status FROM followers f2
            WHERE f2.follower_id = $2 AND f2.following_id = sub.id
            LIMIT 1) AS follow_status,
          COUNT(*) OVER() AS total
       FROM (
         SELECT DISTINCT ON (rp.author_id)
           u.id, u.name, u.username, u.avatar_url, u.privacy,
           rp.created_at AS last_reposted_at
         FROM ${PostModel.TABLE} rp
         JOIN users u ON u.id = rp.author_id
         WHERE rp.repost_of_id = $1
           AND rp.deleted_at IS NULL
           AND u.deleted_at IS NULL
           AND ($5 = '' OR u.username ILIKE $5 OR u.name ILIKE $5)
         ORDER BY rp.author_id, rp.created_at DESC
       ) sub
       LEFT JOIN media AS avatar_media ON avatar_media.id = sub.avatar_url
       ORDER BY sub.last_reposted_at DESC
       LIMIT $3 OFFSET $4`,
      [postId, currentUserId, limit, offset, q]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

// Paginated list of users who voted for ONE option of a post poll, with the
// viewer's follow state (active follow + pending request) and each voter's
// privacy — the same shape as findLikers so the app reuses the users-list
// modal. Returns { rows, total }.
const findPollVoters = async (postId, optionIndex, currentUserId, limit, offset, search = '') => {
  try {
    const q = search ? `%${search}%` : '';
    const { rows } = await pool.query(
      `SELECT
          u.id,
          u.name,
          u.username,
          u.privacy,
          avatar_media.cloudfront_url AS avatar_url,
          EXISTS(
            SELECT 1 FROM followers f
            WHERE f.follower_id = $3 AND f.following_id = u.id AND f.status = 'active'
          ) AS is_following,
          EXISTS(
            SELECT 1 FROM followers f
            WHERE f.follower_id = u.id AND f.following_id = $3 AND f.status = 'active'
          ) AS is_follower,
          (SELECT f2.status FROM followers f2
            WHERE f2.follower_id = $3 AND f2.following_id = u.id
            LIMIT 1) AS follow_status,
          COUNT(*) OVER() AS total
       FROM poll_votes pv
       JOIN users u ON u.id = pv.user_id
       LEFT JOIN media AS avatar_media ON avatar_media.id = u.avatar_url
       WHERE pv.post_id = $1
         AND pv.option_index = $2
         AND u.deleted_at IS NULL
         AND ($6 = '' OR u.username ILIKE $6 OR u.name ILIKE $6)
       ORDER BY pv.created_at DESC
       LIMIT $4 OFFSET $5`,
      [postId, optionIndex, currentUserId, limit, offset, q]
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
        EXISTS(SELECT 1 FROM bookmark bm WHERE bm.source_id = p.id AND bm.source_type = 'post' AND bm.user_id = $2) AS is_bookmarked,
        EXISTS(
          SELECT 1 FROM xp_transactions xt
          WHERE xt.xp_id = (SELECT id FROM xp WHERE user_id = $2 LIMIT 1)
          AND xt.source_type = 'view_post_' || p.id
        ) AS is_xp_claimed,
        EXISTS(
          SELECT 1 FROM posts rp
          WHERE rp.repost_of_id = p.id AND rp.author_id = $2 AND rp.deleted_at IS NULL
        ) AS is_reposted,
        -- Which poll option the requesting user voted for (NULL for guests /
        -- non-voters) so the client can highlight their selection.
        (
          SELECT pv.option_index FROM poll_votes pv
          WHERE pv.post_id = p.id AND pv.user_id = $2 LIMIT 1
        ) AS my_poll_vote,
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
        ) AS media,
        COALESCE(orig.latitude,  p.latitude)  AS latitude,
        COALESCE(orig.longitude, p.longitude) AS longitude,
        COALESCE(orig.place,     p.place)     AS place
        FROM posts p
        JOIN users u ON p.author_id = u.id
        LEFT JOIN posts orig ON orig.id = p.repost_of_id
            AND orig.deleted_at IS NULL AND orig.status = 'published'
        LEFT JOIN media AS ua ON u.avatar_url = ua.id
        LEFT JOIN settings AS s ON s.user_id = u.id
        LEFT JOIN communities AS c ON p.community_id = c.id
        LEFT JOIN media AS ca ON c.avatar_url = ca.id
        LEFT JOIN media m ON p.id = m.post_id
        WHERE 
            p.id = $1
            AND p.deleted_at IS NULL
        GROUP BY p.id, u.id, ua.id, c.id, ca.id, s.user_id, orig.id`,
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
        EXISTS(SELECT 1 FROM bookmark bm WHERE bm.source_id = p.id AND bm.source_type = 'post' AND bm.user_id = $4) AS is_bookmarked,
        EXISTS(
          SELECT 1 FROM xp_transactions xt
          WHERE xt.xp_id = (SELECT id FROM xp WHERE user_id = $4 LIMIT 1)
          AND xt.source_type = 'view_post_' || p.id
        ) AS is_xp_claimed,
        EXISTS(
          SELECT 1 FROM posts rp
          WHERE rp.repost_of_id = p.id AND rp.author_id = $4 AND rp.deleted_at IS NULL
        ) AS is_reposted,
        -- Which poll option the viewing user voted for (NULL = not voted),
        -- so profile/community cards highlight their saved selection.
        (
          SELECT pv.option_index FROM poll_votes pv
          WHERE pv.post_id = p.id AND pv.user_id = $4 LIMIT 1
        ) AS my_poll_vote,
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
        ) AS media, COUNT(*) OVER() AS total,
        COALESCE(orig.latitude,  p.latitude)  AS latitude,
        COALESCE(orig.longitude, p.longitude) AS longitude,
        COALESCE(orig.place,     p.place)     AS place
    FROM posts p
    JOIN users u ON p.author_id = u.id
    LEFT JOIN posts orig ON orig.id = p.repost_of_id
        AND orig.deleted_at IS NULL AND orig.status = 'published'
    LEFT JOIN media AS ua ON u.avatar_url = ua.id
    LEFT JOIN settings AS s ON s.user_id = u.id
    LEFT JOIN communities AS c ON p.community_id = c.id
    LEFT JOIN media AS ca ON c.avatar_url = ca.id
    LEFT JOIN media m ON p.id = m.post_id
    WHERE 
      p.author_id = $1
      AND p.deleted_at IS NULL
      ${repostClause}
    GROUP BY p.id, u.id, ua.id, c.id, ca.id, s.user_id, orig.id
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
        EXISTS(SELECT 1 FROM bookmark bm WHERE bm.source_id = p.id AND bm.source_type = 'post' AND bm.user_id = $4) AS is_bookmarked,
        EXISTS(
          SELECT 1 FROM xp_transactions xt
          WHERE xt.xp_id = (SELECT id FROM xp WHERE user_id = $4 LIMIT 1)
          AND xt.source_type = 'view_post_' || p.id
        ) AS is_xp_claimed,
        EXISTS(
          SELECT 1 FROM posts rp
          WHERE rp.repost_of_id = p.id AND rp.author_id = $4 AND rp.deleted_at IS NULL
        ) AS is_reposted,
        -- Which poll option the viewing user voted for (NULL = not voted),
        -- so profile/community cards highlight their saved selection.
        (
          SELECT pv.option_index FROM poll_votes pv
          WHERE pv.post_id = p.id AND pv.user_id = $4 LIMIT 1
        ) AS my_poll_vote,
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
        ) AS media, COUNT(*) OVER() AS total,
        COALESCE(orig.latitude,  p.latitude)  AS latitude,
        COALESCE(orig.longitude, p.longitude) AS longitude,
        COALESCE(orig.place,     p.place)     AS place
    FROM posts p
    JOIN users u ON p.author_id = u.id
    LEFT JOIN posts orig ON orig.id = p.repost_of_id
        AND orig.deleted_at IS NULL AND orig.status = 'published'
    LEFT JOIN media AS ua ON u.avatar_url = ua.id
    LEFT JOIN settings AS s ON s.user_id = u.id
    LEFT JOIN communities AS c ON p.community_id = c.id
    LEFT JOIN media AS ca ON c.avatar_url = ca.id
    LEFT JOIN media m ON p.id = m.post_id
    WHERE 
      p.community_id = $1
      AND p.deleted_at IS NULL
      -- Private accounts: their posts surface to the author, their approved
      -- followers, AND anyone who is an active MEMBER of the community the post
      -- lives in. Posting into a community deliberately shares the post with
      -- that community, so members must see each other's posts — otherwise a
      -- community whose members keep private accounts looks permanently empty.
      -- AND (u.privacy = 'public' OR p.author_id = $4 OR EXISTS (
      --  SELECT 1 FROM followers f
      --  WHERE f.follower_id = $4 AND f.following_id = p.author_id AND f.status = 'active'
      --) OR EXISTS (
      --  SELECT 1 FROM community_members cm
      --  WHERE cm.community_id = p.community_id AND cm.user_id = $4 AND cm.status = 'active'
      --))
    GROUP BY p.id, u.id, ua.id, c.id, ca.id, s.user_id, orig.id
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
       (author_id, community_id, repost_of_id, title, content, media, tags, category, visibility, status, poll_data, link_data, latitude, longitude, place, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8::text[], $9, $10::varchar, $11, $12, $13, $14, $15, CASE WHEN $10::varchar = 'published' THEN NOW() ELSE NULL END)
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
        data.location?.lat ?? null,
        data.location?.lon ?? null,
        data.location?.place || null,
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
        EXISTS(SELECT 1 FROM bookmark bm WHERE bm.source_id = p.id AND bm.source_type = 'post' AND bm.user_id = $4) AS is_bookmarked,
        EXISTS(
          SELECT 1 FROM xp_transactions xt
          WHERE xt.xp_id = (SELECT id FROM xp WHERE user_id = $4 LIMIT 1)
          AND xt.source_type = 'view_post_' || p.id
        ) AS is_xp_claimed,
        EXISTS(
          SELECT 1 FROM posts rp
          WHERE rp.repost_of_id = p.id AND rp.author_id = $4 AND rp.deleted_at IS NULL
        ) AS is_reposted,
        (
          SELECT pv.option_index FROM poll_votes pv
          WHERE pv.post_id = p.id AND pv.user_id = $4 LIMIT 1
        ) AS my_poll_vote,
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

/**
 * Marks a poll as closed (poll_data.closed = true + closedAt) so no further
 * votes are accepted. Idempotent — closing an already-closed poll is a no-op
 * that still returns the updated poll data. Only touches rows that actually
 * carry a poll.
 */
const closePoll = async (postId) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ${PostModel.TABLE}
       SET poll_data = jsonb_set(
             jsonb_set(poll_data, '{closed}', 'true'::jsonb),
             '{closedAt}', to_jsonb(NOW())
           ),
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
         AND poll_data IS NOT NULL AND poll_data <> '{}'::jsonb
       RETURNING poll_data`,
      [postId]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};

// Lightweight poll fetch for the vote endpoint's pre-checks (404 / no poll / bad option).
const findPollByPostId = async (postId) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, author_id, poll_data FROM ${PostModel.TABLE}
       WHERE id = $1 AND deleted_at IS NULL`,
      [postId]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Records (or moves) a user's vote on a poll option.
 *
 * Double-voting is impossible: poll_votes has a UNIQUE(post_id, user_id)
 * constraint, and the post row is locked FOR UPDATE so concurrent votes
 * serialize. A changed vote decrements the previous option and increments the
 * new one, so tallies stay exact and the user still holds exactly one vote.
 * Legacy votes already stored in poll_data.options[].votes are preserved —
 * only the two affected options are touched.
 */
const castPollVote = async ({ postId, userId, optionIndex }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, poll_data FROM ${PostModel.TABLE}
       WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [postId]
    );
    const post = rows[0];
    if (!post) throw new Error('Post not found');
    if (!post.poll_data || !Array.isArray(post.poll_data.options)) throw new Error('This post has no poll');
    if (!post.poll_data.options[optionIndex]) throw new Error('Invalid poll option');
    // The author closed the poll — no further votes (checked under the row
    // lock so a close racing a vote can never be bypassed).
    if (post.poll_data.closed) throw new Error('This poll is closed');

    // The user's current selection (if any) so a changed vote can move it.
    const { rows: prevRows } = await client.query(
      `SELECT option_index FROM poll_votes WHERE post_id = $1 AND user_id = $2`,
      [postId, userId]
    );
    const prevIndex = prevRows.length ? prevRows[0].option_index : null;

    await client.query(
      `INSERT INTO poll_votes (post_id, user_id, option_index)
       VALUES ($1, $2, $3)
       ON CONFLICT (post_id, user_id)
       DO UPDATE SET option_index = EXCLUDED.option_index, updated_at = NOW()`,
      [postId, userId, optionIndex]
    );

    const readVotes = (idx) => `COALESCE((poll_data->'options'->${idx}->>'votes')::int, 0)`;
    // Parenthesize the whole arithmetic expression BEFORE casting — without
    // them, `x + 1::text::jsonb` parses as `x + (1::jsonb)` (:: binds tighter
    // than +) and Postgres fails with "operator does not exist: integer + jsonb".
    const incExpr = `(${readVotes(optionIndex)} + 1)`;

    let pollData = post.poll_data;
    let myVote = optionIndex;
    let changed = false;

    if (prevIndex !== null && prevIndex === optionIndex) {
      // Toggle OFF — tapping the option you already voted for removes the
      // vote (undo). Deleting the poll_votes row + decrementing the tally.
      await client.query(
        `DELETE FROM poll_votes WHERE post_id = $1 AND user_id = $2`,
        [postId, userId]
      );
      const decExpr = `(GREATEST(0, ${readVotes(prevIndex)} - 1))`;
      const { rows: updated } = await client.query(
        `UPDATE ${PostModel.TABLE} SET poll_data = jsonb_set(
           poll_data, ('{options,' || ${prevIndex} || ',votes}')::text[], ${decExpr}::text::jsonb
         ) WHERE id = $1 RETURNING poll_data`,
        [postId]
      );
      pollData = updated[0]?.poll_data || post.poll_data;
      myVote = null;
      changed = true;
    } else {
      await client.query(
        `INSERT INTO poll_votes (post_id, user_id, option_index)
         VALUES ($1, $2, $3)
         ON CONFLICT (post_id, user_id)
         DO UPDATE SET option_index = EXCLUDED.option_index, updated_at = NOW()`,
        [postId, userId, optionIndex]
      );

      let sql = null;
      if (prevIndex !== null && prevIndex !== optionIndex) {
        // Changed vote: move the tally from the old option to the new one.
        const decExpr = `(GREATEST(0, ${readVotes(prevIndex)} - 1))`;
        sql = `UPDATE ${PostModel.TABLE} SET poll_data = jsonb_set(
                jsonb_set(poll_data, ('{options,' || ${optionIndex} || ',votes}')::text[], ${incExpr}::text::jsonb),
                ('{options,' || ${prevIndex} || ',votes}')::text[], ${decExpr}::text::jsonb
              ) WHERE id = $1 RETURNING poll_data`;
        changed = true;
      } else if (prevIndex === null) {
        // First vote: bump the chosen option.
        sql = `UPDATE ${PostModel.TABLE} SET poll_data = jsonb_set(
                poll_data, ('{options,' || ${optionIndex} || ',votes}')::text[], ${incExpr}::text::jsonb
              ) WHERE id = $1 RETURNING poll_data`;
      }
      // else: re-vote on the SAME option while the row exists — handled above
      // as toggle-off, so this branch is unreachable for same-option taps.

      if (sql) {
        const { rows: updated } = await client.query(sql, [postId]);
        pollData = updated[0]?.poll_data || post.poll_data;
      }
    }

    await client.query('COMMIT');
    return { pollData, myVote, changed };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
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
  findPollVoters,
  findPollByPostId,
  castPollVote,
  closePoll,
};
