'use strict';

const pool = require('../../config/database');

const MAX_INITIAL_SEED = 200;
const INITIAL_BATCH_SIZE_HOME = 40;
const EXTENSION_BATCH_SIZE = 100;
const MAX_SESSION_SIZE = 500;
const MAX_EXTENSION_ATTEMPTS = 3;
const SESSION_TTL_HOURS = 1;

// ── Session Lifecycle ────────────────────────────────────────────────────────

/**
 * Create a new feed session.
 *
 * @param {string} userId
 * @param {string} context - 'home', 'profile', 'bookmarks', 'community', 'search', 'reels'
 * @param {string[]} postOrder - Ordered post IDs (from client seed for reels, empty for others)
 * @param {string|null} latestPublishedAt
 * @returns {{ session, validatedIds, skippedCount }}
 */
const createSession = async (userId, context, postOrder = [], latestPublishedAt = null) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let validatedIds = [];
    let skippedCount = 0;

    if (postOrder.length > 0) {
      // Validate seed posts (for reels context)
      const uniqueIds = [...new Set(postOrder)];
      const boundedIds = uniqueIds.slice(0, MAX_INITIAL_SEED);

      const { rows: validPosts } = await client.query(
        `SELECT p.id
         FROM posts p
         JOIN users u ON u.id = p.author_id
         LEFT JOIN communities c ON p.community_id = c.id
         WHERE p.id = ANY($1::uuid[])
           AND p.deleted_at IS NULL
           AND p.status = 'published'
           AND (
             u.privacy = 'public'
             OR p.author_id = $2
             OR EXISTS (
               SELECT 1 FROM followers f
               WHERE f.follower_id = $2 AND f.following_id = p.author_id AND f.status = 'active'
             )
           )
           AND (
             p.community_id IS NULL
             OR c.privacy = 'public'
             OR p.community_id IN (
               SELECT community_id FROM community_members
               WHERE user_id = $2 AND status = 'active'
             )
           )`,
        [boundedIds, userId]
      );

      const validSet = new Set(validPosts.map(r => r.id));
      validatedIds = boundedIds.filter(id => validSet.has(id));
      skippedCount = boundedIds.length - validatedIds.length;

      // Find latest published_at from validated posts
      if (validatedIds.length > 0 && !latestPublishedAt) {
        const { rows: meta } = await client.query(
          `SELECT MAX(published_at) AS latest_pub
           FROM posts WHERE id = ANY($1::uuid[])`,
          [validatedIds]
        );
        latestPublishedAt = meta[0]?.latest_pub || null;
      }
    }

    const { rows: [session] } = await client.query(
      `INSERT INTO feed_sessions (user_id, context, total_posts, latest_published_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, context, total_posts, latest_published_at, created_at, expires_at`,
      [userId, context, validatedIds.length, latestPublishedAt]
    );

    if (validatedIds.length > 0) {
      const values = validatedIds
        .map((postId, i) => `('${session.id}', '${postId}', ${i})`)
        .join(', ');

      await client.query(
        `INSERT INTO feed_session_posts (session_id, post_id, position)
         VALUES ${values}
         ON CONFLICT (session_id, position) DO NOTHING`
      );
    }

    await client.query('COMMIT');
    return { session, validatedIds, skippedCount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// ── Session Reads ────────────────────────────────────────────────────────────

const getSession = async (sessionId, userId) => {
  const { rows } = await pool.query(
    `SELECT id, user_id, context, total_posts, latest_published_at, created_at, expires_at
     FROM feed_sessions
     WHERE id = $1 AND user_id = $2 AND expires_at > NOW()`,
    [sessionId, userId]
  );
  return rows[0] || null;
};

const getSessionForUpdate = async (client, sessionId) => {
  const { rows } = await client.query(
    `SELECT id, user_id, context, total_posts
     FROM feed_sessions
     WHERE id = $1
     FOR UPDATE`,
    [sessionId]
  );
  return rows[0] || null;
};

/**
 * Fetch a page of posts from a session using live-post offset.
 */
const getSessionPage = async (sessionId, offset, limit, userId) => {
  const { rows } = await pool.query(
    `WITH live_posts AS (
      SELECT
        p.id, p.author_id, p.community_id, p.repost_of_id, p.title, p.content,
        p.tags, p.status, p.visibility,
        p.likes_count, p.comments_count, p.shares_count, p.views_count,
        p.is_pinned, p.poll_data,
        p.published_at, p.created_at,
        rsp.position,
        ROW_NUMBER() OVER (ORDER BY rsp.position) - 1 AS live_offset,
        json_build_object(
          'id', u.id, 'name', u.name, 'username', u.username,
          'avatar_url', CASE WHEN u.avatar_url IS NULL THEN NULL
            ELSE json_build_object('cloudfront_url', ua.cloudfront_url)
          END
        ) AS author,
        CASE WHEN c.id IS NULL THEN NULL
          ELSE json_build_object(
            'id', c.id, 'name', c.name, 'slug', c.slug,
            'privacy', c.privacy,
            'avatar_url', CASE WHEN c.avatar_url IS NULL THEN NULL
              ELSE json_build_object('cloudfront_url', ca.cloudfront_url)
            END
          )
        END AS community,
        EXISTS(
          SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = $4
        ) AS is_liked,
        EXISTS(
          SELECT 1 FROM bookmark bm
          WHERE bm.source_id = p.id AND bm.source_type = 'post' AND bm.user_id = $4
        ) AS is_bookmarked,
        EXISTS(
          SELECT 1 FROM posts rp
          WHERE rp.repost_of_id = p.id AND rp.author_id = $4 AND rp.deleted_at IS NULL
        ) AS is_reposted,
        COALESCE(s.allow_reposts, TRUE) AS author_reposts_enabled,
        COALESCE(c.allow_reposts, TRUE) AS community_reposts_enabled,
        (
          SELECT pv.option_index FROM poll_votes pv
          WHERE pv.post_id = p.id AND pv.user_id = $4 LIMIT 1
        ) AS my_poll_vote,
        COALESCE(
          json_agg(
            json_build_object(
              'media_id', m.id,
              'media_type', m.media_type,
              'media_url', m.cloudfront_url,
              'preview_url', m.preview_url,
              'width', m.width,
              'height', m.height,
              'duration_seconds', m.duration_seconds,
              'file_size_bytes', m.size_bytes,
              'mime_type', m.mime_type,
              'has_audio', (m.media_type = 'video' AND m.mime_type NOT LIKE '%audio-only%')
            ) ORDER BY m.created_at ASC
          ) FILTER (WHERE m.id IS NOT NULL AND m.deleted_at IS NULL),
          '[]'::json
        ) AS media
      FROM feed_session_posts rsp
      JOIN posts p ON p.id = rsp.post_id
        AND p.deleted_at IS NULL
        AND p.status = 'published'
      JOIN users u ON u.id = p.author_id
      LEFT JOIN posts orig ON orig.id = p.repost_of_id AND orig.deleted_at IS NULL AND orig.status = 'published'
      LEFT JOIN communities c ON p.community_id = c.id
      LEFT JOIN settings AS s ON s.user_id = u.id
      LEFT JOIN media AS ua ON u.avatar_url = ua.id
      LEFT JOIN media AS ca ON c.avatar_url = ca.id
      LEFT JOIN media m ON COALESCE(orig.id, p.id) = m.post_id
      WHERE rsp.session_id = $1
      GROUP BY p.id, u.id, ua.id, c.id, ca.id, s.user_id, orig.id, rsp.position
    )
    SELECT * FROM live_posts
    WHERE live_offset >= $2 AND live_offset < $3`,
    [sessionId, offset, offset + limit, userId]
  );
  return rows;
};

const getSessionLivePostCount = async (sessionId) => {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS live_count
     FROM feed_session_posts rsp
     JOIN posts p ON p.id = rsp.post_id
       AND p.deleted_at IS NULL
       AND p.status = 'published'
     WHERE rsp.session_id = $1`,
    [sessionId]
  );
  return parseInt(rows[0]?.live_count || '0', 10);
};

const getSessionPostIds = async (sessionId) => {
  const { rows } = await pool.query(
    `SELECT post_id FROM feed_session_posts WHERE session_id = $1`,
    [sessionId]
  );
  return new Set(rows.map(r => r.post_id));
};

// ── Session Extension (atomic, locked) ──────────────────────────────────────

const appendPostsAtomic = async (client, sessionId, postIds) => {
  if (!postIds || postIds.length === 0) {
    return { appended: 0, newTotal: 0 };
  }

  const { rows: [{ max_pos }] } = await client.query(
    `SELECT COALESCE(MAX(position), -1) AS max_pos
     FROM feed_session_posts
     WHERE session_id = $1`,
    [sessionId]
  );

  const currentCount = max_pos + 1;
  const availableSlots = MAX_SESSION_SIZE - currentCount;
  if (availableSlots <= 0) {
    return { appended: 0, newTotal: currentCount };
  }

  const toInsert = postIds.slice(0, availableSlots);
  if (toInsert.length === 0) {
    return { appended: 0, newTotal: currentCount };
  }

  const startPos = max_pos + 1;
  const values = toInsert
    .map((postId, i) => `('${sessionId}', '${postId}', ${startPos + i})`)
    .join(', ');

  await client.query(
    `INSERT INTO feed_session_posts (session_id, post_id, position)
     VALUES ${values}
     ON CONFLICT (session_id, position) DO NOTHING`
  );

  const newTotal = currentCount + toInsert.length;
  await client.query(
    `UPDATE feed_sessions SET total_posts = $1 WHERE id = $2`,
    [newTotal, sessionId]
  );

  return { appended: toInsert.length, newTotal };
};

// ── Cleanup ─────────────────────────────────────────────────────────────────

const deleteExpiredSessions = async () => {
  const { rowCount } = await pool.query(
    `DELETE FROM feed_sessions WHERE expires_at < NOW()`
  );
  return rowCount || 0;
};

module.exports = {
  MAX_INITIAL_SEED,
  INITIAL_BATCH_SIZE_HOME,
  EXTENSION_BATCH_SIZE,
  MAX_SESSION_SIZE,
  MAX_EXTENSION_ATTEMPTS,
  createSession,
  getSession,
  getSessionForUpdate,
  getSessionPage,
  getSessionLivePostCount,
  getSessionPostIds,
  appendPostsAtomic,
  deleteExpiredSessions,
};
