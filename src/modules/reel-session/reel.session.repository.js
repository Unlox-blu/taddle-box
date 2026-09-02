'use strict';

const pool = require('../../config/database');

const MAX_INITIAL_SEED = 200;
const EXTENSION_BATCH_SIZE = 100;
const MAX_SESSION_SIZE = 1000;
const MAX_EXTENSION_ATTEMPTS = 3;
const SESSION_TTL_HOURS = 1;

// ── Session Lifecycle ────────────────────────────────────────────────────────

/**
 * Create a new reel session with a frozen ranking order.
 * Seed posts are validated: existence, publish status, access, deduplication.
 *
 * @param {string} userId
 * @param {string[]} postOrder - Ordered array of post IDs (from client seed)
 * @param {string} feedContext - 'home', 'profile', 'bookmarks', 'community', 'search'
 * @param {string|null} latestPublishedAt - ISO timestamp of the newest post
 * @returns {{ session: object, validatedIds: string[], skippedCount: number }}
 */
const createSession = async (userId, postOrder, feedContext = 'home', latestPublishedAt) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Validate seed posts ──────────────────────────────────────────────
    // Verify posts exist, are published, not deleted, and user can access them.
    const uniqueIds = [...new Set(postOrder)];
    const boundedIds = uniqueIds.slice(0, MAX_INITIAL_SEED);

    if (boundedIds.length === 0) {
      await client.query('ROLLBACK');
      return { session: null, validatedIds: [], skippedCount: 0 };
    }

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
    const validatedIds = boundedIds.filter(id => validSet.has(id));
    const skippedCount = boundedIds.length - validatedIds.length;

    // Find latest published_at from validated posts
    let latestPub = latestPublishedAt;
    if (validatedIds.length > 0 && !latestPub) {
      const { rows: meta } = await client.query(
        `SELECT MAX(published_at) AS latest_pub
         FROM posts WHERE id = ANY($1::uuid[])`,
        [validatedIds]
      );
      latestPub = meta[0]?.latest_pub || null;
    }

    // ── Create session ───────────────────────────────────────────────────
    const { rows: [session] } = await client.query(
      `INSERT INTO reel_sessions (user_id, feed_context, total_posts, latest_published_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, feed_context, total_posts, latest_published_at, created_at, expires_at`,
      [userId, feedContext, validatedIds.length, latestPub || null]
    );

    // ── Insert validated posts ───────────────────────────────────────────
    if (validatedIds.length > 0) {
      const values = validatedIds
        .map((postId, i) => `('${session.id}', '${postId}', ${i})`)
        .join(', ');

      await client.query(
        `INSERT INTO reel_session_posts (session_id, post_id, position)
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

/**
 * Get a reel session by ID.
 * Enforces expiry: returns null if session has expired.
 * Enforces ownership: returns null if session belongs to another user.
 */
const getSession = async (sessionId, userId) => {
  const { rows } = await pool.query(
    `SELECT id, user_id, feed_context, total_posts, latest_published_at, created_at, expires_at
     FROM reel_sessions
     WHERE id = $1 AND user_id = $2 AND expires_at > NOW()`,
    [sessionId, userId]
  );
  return rows[0] || null;
};

/**
 * Get session with FOR UPDATE lock.
 * Used during extension to prevent concurrent modifications.
 */
const getSessionForUpdate = async (client, sessionId) => {
  const { rows } = await client.query(
    `SELECT id, user_id, total_posts
     FROM reel_sessions
     WHERE id = $1
     FOR UPDATE`,
    [sessionId]
  );
  return rows[0] || null;
};

/**
 * Fetch a page of posts from a session.
 *
 * Uses live-post offset: the offset counts only non-deleted, published posts.
 * This ensures the frontend's sequential page requests don't skip content
 * or return empty pages when a post is deleted mid-session.
 *
 * Example:
 *   Session positions: A B C D E F G H
 *   C is deleted → live posts: A B D E F G H
 *   offset=3, limit=2 → returns D, E (4th and 5th live posts)
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
      FROM reel_session_posts rsp
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

/**
 * Get the total count of live (non-deleted) posts in a session.
 * Used for pagination bounds (hasMore).
 */
const getSessionLivePostCount = async (sessionId) => {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS live_count
     FROM reel_session_posts rsp
     JOIN posts p ON p.id = rsp.post_id
       AND p.deleted_at IS NULL
       AND p.status = 'published'
     WHERE rsp.session_id = $1`,
    [sessionId]
  );
  return parseInt(rows[0]?.live_count || '0', 10);
};

/**
 * Get all post IDs currently in the session (for deduplication during extension).
 */
const getSessionPostIds = async (sessionId) => {
  const { rows } = await pool.query(
    `SELECT post_id FROM reel_session_posts WHERE session_id = $1`,
    [sessionId]
  );
  return new Set(rows.map(r => r.post_id));
};

// ── Session Extension (atomic, locked) ──────────────────────────────────────

/**
 * Append posts to a session atomically.
 *
 * This is called inside a locked transaction that already:
 *   1. Acquired FOR UPDATE on the session row
 *   2. Re-checked that extension is still needed
 *   3. Determined the current max position
 *
 * This method does the INSERT and total_posts UPDATE, then commits.
 *
 * @param {object} client - Database client (already in transaction)
 * @param {string} sessionId
 * @param {string[]} postIds - Validated, deduplicated, unique-new post IDs
 * @returns {{ appended: number, newTotal: number }}
 */
const appendPostsAtomic = async (client, sessionId, postIds) => {
  if (!postIds || postIds.length === 0) {
    return { appended: 0, newTotal: 0 };
  }

  // Get current max position (within the locked transaction)
  const { rows: [{ max_pos }] } = await client.query(
    `SELECT COALESCE(MAX(position), -1) AS max_pos
     FROM reel_session_posts
     WHERE session_id = $1`,
    [sessionId]
  );

  const currentCount = max_pos + 1;
  const availableSlots = MAX_SESSION_SIZE - currentCount;
  if (availableSlots <= 0) {
    return { appended: 0, newTotal: currentCount };
  }

  // Trim to available slots
  const toInsert = postIds.slice(0, availableSlots);
  if (toInsert.length === 0) {
    return { appended: 0, newTotal: currentCount };
  }

  const startPos = max_pos + 1;
  const values = toInsert
    .map((postId, i) => `('${sessionId}', '${postId}', ${startPos + i})`)
    .join(', ');

  await client.query(
    `INSERT INTO reel_session_posts (session_id, post_id, position)
     VALUES ${values}
     ON CONFLICT (session_id, position) DO NOTHING`
  );

  const newTotal = currentCount + toInsert.length;
  await client.query(
    `UPDATE reel_sessions SET total_posts = $1 WHERE id = $2`,
    [newTotal, sessionId]
  );

  return { appended: toInsert.length, newTotal };
};

/**
 * Run a full extension cycle within a single locked transaction.
 *
 * Flow:
 *   1. Lock session row (FOR UPDATE)
 *   2. Re-check: is extension still needed? (another request may have done it)
 *   3. Generate candidates from feed algorithm
 *   4. Filter: remove session IDs, remove deleted/ineligible
 *   5. Append valid posts atomically
 *   6. If still insufficient, retry (up to MAX_EXTENSION_ATTEMPTS)
 *   7. Commit
 *
 * @param {string} sessionId
 * @param {string} userId
 * @param {number} targetCount - How many live posts we want to reach
 * @returns {number} Number of posts appended in this cycle
 */
const runExtensionCycle = async (sessionId, userId, targetCount) => {
  // We need access to the feed service, which is injected at the service level.
  // This method is a helper that the service calls within its own transaction.
  // For the repository, we just handle the DB side.
  //
  // The service will call this in a loop with a client:
  //   const client = await pool.connect();
  //   await client.query('BEGIN');
  //   const session = await getSessionForUpdate(client, sessionId);
  //   ... extension logic ...
  //   await client.query('COMMIT');

  // This is a placeholder — the actual extension logic lives in the service
  // because it needs the feed algorithm. The repository provides the primitives.
  throw new Error('runExtensionCycle should be called from the service layer');
};

// ── Cleanup ─────────────────────────────────────────────────────────────────

/**
 * Delete expired sessions (cleanup job).
 * Called by background worker/cron, not by client.
 */
const deleteExpiredSessions = async () => {
  const { rowCount } = await pool.query(
    `DELETE FROM reel_sessions WHERE expires_at < NOW()`
  );
  return rowCount || 0;
};

module.exports = {
  MAX_INITIAL_SEED,
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
