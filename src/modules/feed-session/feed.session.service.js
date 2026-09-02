'use strict';

const pool = require('../../config/database');
const PostModel = require('../feed/feed.model');
const feedSessionRepo = require('./feed.session.repository');

const PAGE_SIZE = 20;

class FeedSessionService {
  constructor({ feedRepository, feedService }) {
    this.feedRepo = feedRepository;
    this.feedSvc = feedService;
  }

  /**
   * Create a new feed session.
   *
   * Context determines initialization strategy:
   *   - 'home': Run personalized ranking, store first N posts
   *   - 'profile': Query user's posts chronologically
   *   - 'bookmarks': Query bookmarked posts
   *   - 'community': Query community posts
   *   - 'search': Query search results
   *   - 'reels': Freeze client-provided seed posts
   */
  async createSession(userId, { context = 'home', seedPostIds = [], initialPostId, feedContextId, hashtag } = {}) {
    let postOrder = [];

    switch (context) {
      case 'reels': {
        // Reels: freeze the client-provided seed posts
        postOrder = seedPostIds;
        break;
      }
      case 'home': {
        // Home: run personalized ranking
        const result = await this.feedSvc.getPersonalizedFeed({
          userId,
          limit: feedSessionRepo.INITIAL_BATCH_SIZE_HOME,
          offset: 0,
          page: 1,
          hashtag: hashtag || null,
          cursorData: null,
          newerCursorData: null,
        });
        postOrder = (result.posts || []).map(p => p.id);
        break;
      }
      case 'profile': {
        if (!feedContextId) break;
        const res = await this.feedSvc.postRepo.getUserPosts
          ? await this.feedSvc.postRepo.getUserPosts(feedContextId, 1, feedSessionRepo.INITIAL_BATCH_SIZE_HOME)
          : { rows: [] };
        postOrder = (res.rows || []).map(p => p.id);
        break;
      }
      case 'bookmarks': {
        // Bookmarks: query user's bookmarks
        const { rows } = await pool.query(
          `SELECT source_id AS id FROM bookmark
           WHERE user_id = $1 AND source_type = 'post'
           ORDER BY created_at DESC
           LIMIT $2`,
          [userId, feedSessionRepo.INITIAL_BATCH_SIZE_HOME]
        );
        postOrder = rows.map(r => r.id);
        break;
      }
      case 'community': {
        if (!feedContextId) break;
        // Community: query community posts
        const { rows } = await pool.query(
          `SELECT id FROM posts
           WHERE community_id = $1
             AND deleted_at IS NULL
             AND status = 'published'
           ORDER BY published_at DESC
           LIMIT $2`,
          [feedContextId, feedSessionRepo.INITIAL_BATCH_SIZE_HOME]
        );
        postOrder = rows.map(r => r.id);
        break;
      }
      case 'search': {
        // Search: would need search query, for now return empty
        // TODO: integrate with search service
        break;
      }
    }

    const { session, validatedIds, skippedCount } = await feedSessionRepo.createSession(
      userId,
      context,
      postOrder,
      null,
    );

    if (!session || validatedIds.length === 0) {
      return { session: null, posts: [], startIndex: 0, skippedCount };
    }

    // Hydrate the first page
    const posts = await feedSessionRepo.getSessionPage(session.id, 0, PAGE_SIZE, userId);
    const formattedPosts = posts.map(PostModel.format).filter(Boolean);

    let startIndex = 0;
    if (initialPostId) {
      const idx = formattedPosts.findIndex((p) => p.id === initialPostId);
      if (idx >= 0) startIndex = idx;
    }

    return {
      session: {
        id: session.id,
        context: session.context,
        createdAt: session.created_at,
        expiresAt: session.expires_at,
      },
      posts: formattedPosts,
      startIndex,
      skippedCount,
    };
  }

  /**
   * Load a page of posts from an existing session.
   * Auto-extends when exhausted (append-only).
   */
  async loadPage(sessionId, userId, offset = 0, limit = PAGE_SIZE) {
    const session = await feedSessionRepo.getSession(sessionId, userId);
    if (!session) {
      return { posts: [], nextOffset: 0, hasMore: false, error: 'Session not found or expired' };
    }

    const posts = await feedSessionRepo.getSessionPage(sessionId, offset, limit, userId);
    const formattedPosts = posts.map(PostModel.format).filter(Boolean);

    const nextOffset = offset + posts.length;
    const liveCount = await feedSessionRepo.getSessionLivePostCount(sessionId);

    // Auto-extend when session is underfilled
    let isFeedExhausted = false;
    if (posts.length < limit && liveCount < feedSessionRepo.MAX_SESSION_SIZE) {
      const { appended, feedExhausted } = await this.extendSession(sessionId, userId, session.context, limit);
      isFeedExhausted = feedExhausted;
      if (appended > 0) {
        const remaining = limit - posts.length;
        const morePosts = await feedSessionRepo.getSessionPage(sessionId, nextOffset, remaining, userId);
        const moreFormatted = morePosts.map(PostModel.format).filter(Boolean);
        formattedPosts.push(...moreFormatted);
      }
    }

    const finalNextOffset = offset + formattedPosts.length;
    const finalLiveCount = await feedSessionRepo.getSessionLivePostCount(sessionId);

    const hasMore = isFeedExhausted
      ? finalNextOffset < finalLiveCount
      : true;

    return {
      posts: formattedPosts,
      nextOffset: finalNextOffset,
      hasMore,
      sessionId: session.id,
    };
  }

  /**
   * Extend the session inside a locked transaction.
   */
  async extendSession(sessionId, userId, context, desiredCount) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const session = await feedSessionRepo.getSessionForUpdate(client, sessionId);
      if (!session) {
        await client.query('ROLLBACK');
        return { appended: 0, feedExhausted: false };
      }

      let totalAppended = 0;
      let feedExhausted = false;

      for (let attempt = 0; attempt < feedSessionRepo.MAX_EXTENSION_ATTEMPTS; attempt++) {
        const currentLiveCount = await this.getLiveCountUnderLock(client, sessionId);
        if (currentLiveCount >= desiredCount || currentLiveCount >= feedSessionRepo.MAX_SESSION_SIZE) {
          break;
        }

        const existingIds = await this.getPostIdsUnderLock(client, sessionId);

        let candidates;
        try {
          candidates = await this.generateCandidates(userId, context, existingIds);
        } catch {
          break;
        }

        if (candidates.length === 0) {
          feedExhausted = true;
          break;
        }

        const validIds = await this.validatePostIds(client, candidates, userId);
        if (validIds.length === 0) continue;

        const { appended } = await feedSessionRepo.appendPostsAtomic(client, sessionId, validIds);
        totalAppended += appended;

        if (appended === 0) continue;
      }

      await client.query('COMMIT');
      return { appended: totalAppended, feedExhausted };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate candidate post IDs based on session context.
   */
  async generateCandidates(userId, context, existingIds) {
    switch (context) {
      case 'home': {
        const result = await this.feedSvc.getPersonalizedFeed({
          userId,
          limit: feedSessionRepo.EXTENSION_BATCH_SIZE,
          offset: 0,
          page: 1,
          hashtag: null,
          cursorData: null,
          newerCursorData: null,
        });
        return (result.posts || [])
          .map(p => p.id)
          .filter(id => !existingIds.has(id));
      }
      case 'reels': {
        const result = await this.feedSvc.getPersonalizedFeed({
          userId,
          limit: feedSessionRepo.EXTENSION_BATCH_SIZE,
          offset: 0,
          page: 1,
          hashtag: null,
          cursorData: null,
          newerCursorData: null,
        });
        return (result.posts || [])
          .map(p => p.id)
          .filter(id => !existingIds.has(id));
      }
      default:
        return [];
    }
  }

  async getLiveCountUnderLock(client, sessionId) {
    const { rows } = await client.query(
      `SELECT COUNT(*) AS live_count
       FROM feed_session_posts rsp
       JOIN posts p ON p.id = rsp.post_id
         AND p.deleted_at IS NULL
         AND p.status = 'published'
       WHERE rsp.session_id = $1`,
      [sessionId]
    );
    return parseInt(rows[0]?.live_count || '0', 10);
  }

  async getPostIdsUnderLock(client, sessionId) {
    const { rows } = await client.query(
      `SELECT post_id FROM feed_session_posts WHERE session_id = $1`,
      [sessionId]
    );
    return new Set(rows.map(r => r.post_id));
  }

  async validatePostIds(client, postIds, userId) {
    if (postIds.length === 0) return [];

    const { rows } = await client.query(
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
      [postIds, userId]
    );

    return rows.map(r => r.id);
  }

  async cleanupExpiredSessions() {
    return feedSessionRepo.deleteExpiredSessions();
  }
}

module.exports = FeedSessionService;
