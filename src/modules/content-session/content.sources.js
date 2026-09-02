'use strict';

const pool = require('../../config/database');

/**
 * Content Source Generators (Strategy Pattern)
 *
 * Each generator owns:
 *   - getPaginationContext(session): derive source-specific pagination state
 *   - generateContent(params): fetch content, returns { items, hasMore, paginationContext }
 *
 * The session service delegates entirely to the generator.
 * No source-specific logic lives in ContentSessionService.
 */

// ── Home Feed (personalized ranking) ────────────────────────────────────────

const homeGenerator = {
  async getPaginationContext() {
    return null; // Home uses algorithm with exclusion, no cursor
  },

  async generateContent(feedService, userId, { limit, excludedContentIds }) {
    const result = await feedService.getPersonalizedFeed({
      userId, limit, offset: 0, page: 1,
      hashtag: null, cursorData: null, newerCursorData: null,
    });

    const posts = result.posts || [];
    const items = posts
      .map(p => p.id)
      .filter(id => !excludedContentIds.has(id))
      .map(id => ({ contentType: 'post', contentId: id }));

    return {
      items,
      hasMore: items.length >= limit,
      paginationContext: null, // Home doesn't need cursor
    };
  },
};

// ── Profile (user's posts, chronological) ───────────────────────────────────

const profileGenerator = {
  async getPaginationContext(session) {
    const { rows } = await pool.query(
      `SELECT csi.content_id, p.published_at
       FROM content_session_items csi
       JOIN posts p ON p.id = csi.content_id AND csi.content_type = 'post'
       WHERE csi.session_id = $1
       ORDER BY csi.position DESC LIMIT 1`,
      [session.id]
    );
    if (rows.length === 0) return null;
    return { publishedAt: rows[0].published_at, id: rows[0].content_id };
  },

  async generateContent(userId, { sourceContextId, limit, paginationContext }) {
    if (!sourceContextId) return { items: [], hasMore: false, paginationContext: null };

    let query = `
      SELECT id, published_at FROM posts
      WHERE author_id = $1 AND deleted_at IS NULL AND status = 'published'`;
    const params = [sourceContextId];
    let idx = 2;

    if (paginationContext?.publishedAt) {
      query += ` AND (published_at < $${idx} OR (published_at = $${idx} AND id < $${idx + 1}))`;
      params.push(paginationContext.publishedAt, paginationContext.id);
      idx += 2;
    }

    query += ` ORDER BY published_at DESC, id DESC LIMIT $${idx}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);
    const items = rows.map(r => ({ contentType: 'post', contentId: r.id }));

    const last = rows[rows.length - 1];
    return {
      items,
      hasMore: items.length >= limit,
      paginationContext: last
        ? { publishedAt: last.published_at, id: last.id }
        : null,
    };
  },
};

// ── Bookmarks (bookmarked posts, chronological) ─────────────────────────────

const bookmarksGenerator = {
  async getPaginationContext(session) {
    const { rows } = await pool.query(
      `SELECT csi.content_id, b.created_at AS bookmarked_at
       FROM content_session_items csi
       JOIN bookmark b ON b.source_id = csi.content_id AND b.source_type = 'post' AND b.user_id = $2
       WHERE csi.session_id = $1
       ORDER BY csi.position DESC LIMIT 1`,
      [session.id, session.user_id]
    );
    if (rows.length === 0) return null;
    return { bookmarkedAt: rows[0].bookmarked_at, id: rows[0].content_id };
  },

  async generateContent(userId, { limit, paginationContext }) {
    let query = `
      SELECT source_id AS id, created_at AS bookmarked_at
      FROM bookmark WHERE user_id = $1 AND source_type = 'post'`;
    const params = [userId];
    let idx = 2;

    if (paginationContext?.bookmarkedAt) {
      query += ` AND (bookmarked_at < $${idx} OR (bookmarked_at = $${idx} AND source_id < $${idx + 1}))`;
      params.push(paginationContext.bookmarkedAt, paginationContext.id);
      idx += 2;
    }

    query += ` ORDER BY bookmarked_at DESC, source_id DESC LIMIT $${idx}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);
    const items = rows.map(r => ({ contentType: 'post', contentId: r.id }));

    const last = rows[rows.length - 1];
    return {
      items,
      hasMore: items.length >= limit,
      paginationContext: last
        ? { bookmarkedAt: last.bookmarked_at, id: last.id }
        : null,
    };
  },
};

// ── Community (community posts, chronological) ──────────────────────────────

const communityGenerator = {
  async getPaginationContext(session) {
    const { rows } = await pool.query(
      `SELECT csi.content_id, p.published_at
       FROM content_session_items csi
       JOIN posts p ON p.id = csi.content_id AND csi.content_type = 'post'
       WHERE csi.session_id = $1
       ORDER BY csi.position DESC LIMIT 1`,
      [session.id]
    );
    if (rows.length === 0) return null;
    return { publishedAt: rows[0].published_at, id: rows[0].content_id };
  },

  async generateContent(userId, { sourceContextId, limit, paginationContext }) {
    if (!sourceContextId) return { items: [], hasMore: false, paginationContext: null };

    let query = `
      SELECT id, published_at FROM posts
      WHERE community_id = $1 AND deleted_at IS NULL AND status = 'published'`;
    const params = [sourceContextId];
    let idx = 2;

    if (paginationContext?.publishedAt) {
      query += ` AND (published_at < $${idx} OR (published_at = $${idx} AND id < $${idx + 1}))`;
      params.push(paginationContext.publishedAt, paginationContext.id);
      idx += 2;
    }

    query += ` ORDER BY published_at DESC, id DESC LIMIT $${idx}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);
    const items = rows.map(r => ({ contentType: 'post', contentId: r.id }));

    const last = rows[rows.length - 1];
    return {
      items,
      hasMore: items.length >= limit,
      paginationContext: last
        ? { publishedAt: last.published_at, id: last.id }
        : null,
    };
  },
};

// ── Search (TODO) ───────────────────────────────────────────────────────────

const searchGenerator = {
  async getPaginationContext() {
    return null; // TODO: search cursor
  },

  async generateContent() {
    return { items: [], hasMore: false, paginationContext: null };
  },
};

// ── Registry ────────────────────────────────────────────────────────────────

const generators = {
  home: homeGenerator,
  profile: profileGenerator,
  bookmarks: bookmarksGenerator,
  community: communityGenerator,
  search: searchGenerator,
};

const getGenerator = (sourceContext) => generators[sourceContext] || null;

module.exports = { getGenerator, generators };
