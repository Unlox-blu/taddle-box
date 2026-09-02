'use strict';

const pool = require('../../config/database');
const PostModel = require('../feed/feed.model');
const reelSessionRepo = require('./reel.session.repository');

const PAGE_SIZE = 20;

class ReelSessionService {
  constructor({ feedRepository, feedService }) {
    this.feedRepo = feedRepository;
    this.feedSvc = feedService;
  }

  /**
   * Create a new Reel session using seed posts from the client.
   * Seed posts are validated server-side (existence, access, dedup).
   */
  async createSession(userId, { seedPostIds = [], feedContext = 'home', initialPostId } = {}) {
    if (seedPostIds.length === 0) {
      return { session: null, posts: [] };
    }

    const { session, validatedIds, skippedCount } = await reelSessionRepo.createSession(
      userId,
      seedPostIds,
      feedContext,
      null, // latestPublishedAt is computed inside createSession
    );

    if (!session || validatedIds.length === 0) {
      return { session: null, posts: [], skippedCount };
    }

    // Hydrate the first page
    const posts = await reelSessionRepo.getSessionPage(session.id, 0, PAGE_SIZE, userId);
    const formattedPosts = posts.map(PostModel.format).filter(Boolean);

    let startIndex = 0;
    if (initialPostId) {
      const idx = formattedPosts.findIndex((p) => p.id === initialPostId);
      if (idx >= 0) startIndex = idx;
    }

    return {
      session: {
        id: session.id,
        createdAt: session.created_at,
        expiresAt: session.expires_at,
      },
      posts: formattedPosts,
      startIndex,
      skippedCount,
    };
  }

  /**
   * Load a page of posts from an existing Reel session.
   *
   * Uses live-post offset: offset counts only non-deleted, published posts.
   * This prevents deleted posts from causing skipped/empty pages.
   *
   * Auto-extends when the session doesn't have enough live posts.
   * Extension runs inside a locked transaction to prevent duplicates.
   */
  async loadPage(sessionId, userId, offset = 0, limit = PAGE_SIZE) {
    const session = await reelSessionRepo.getSession(sessionId, userId);
    if (!session) {
      return { posts: [], nextOffset: 0, hasMore: false, error: 'Session not found or expired' };
    }

    const posts = await reelSessionRepo.getSessionPage(sessionId, offset, limit, userId);
    const formattedPosts = posts.map(PostModel.format).filter(Boolean);

    const nextOffset = offset + posts.length;
    const liveCount = await reelSessionRepo.getSessionLivePostCount(sessionId);

    // If we got fewer posts than requested AND haven't hit max size, extend.
    let isFeedExhausted = false;
    if (posts.length < limit && liveCount < reelSessionRepo.MAX_SESSION_SIZE) {
      const { appended, feedExhausted } = await this.extendSession(sessionId, userId, limit);
      isFeedExhausted = feedExhausted;
      if (appended > 0) {
        // Re-fetch the remaining posts after extension
        const remaining = limit - posts.length;
        const morePosts = await reelSessionRepo.getSessionPage(sessionId, nextOffset, remaining, userId);
        const moreFormatted = morePosts.map(PostModel.format).filter(Boolean);
        formattedPosts.push(...moreFormatted);
      }
    }

    const finalNextOffset = offset + formattedPosts.length;
    const finalLiveCount = await reelSessionRepo.getSessionLivePostCount(sessionId);

    // hasMore logic:
    //   - If feed is genuinely exhausted (zero candidates from algorithm),
    //     only hasMore if there are still live posts beyond our offset.
    //   - If extension failed transiently (algorithm errors, duplicates, etc.),
    //     ALWAYS allow retry by setting hasMore = true.
    // This prevents permanently stopping pagination due to a transient failure.
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
   *
   * Flow:
   *   1. Acquire FOR UPDATE lock on session row
   *   2. Re-check: is extension still needed? (another request may have done it)
   *   3. Generate candidates from feed algorithm
   *   4. Filter: remove session IDs, remove deleted/ineligible
   *   5. Append valid posts atomically
   *   6. If still insufficient, retry (up to MAX_EXTENSION_ATTEMPTS)
   *   7. Commit (or rollback on error)
   *
   * @param {string} sessionId
   * @param {string} userId
   * @param {number} desiredCount - How many total live posts we want
   * @returns {number} Number of posts appended in this cycle
   */
  /**
   * Extend the session inside a locked transaction.
   *
   * Returns:
   *   - appended: number of posts successfully added
   *   - exhausted: true if the algorithm returned zero candidates
   *     (strong signal the user's eligible feed is genuinely empty)
   *   - false if extension failed transiently (algorithm errors,
   *     all candidates were duplicates, etc.) — should NOT stop pagination
   */
  async extendSession(sessionId, userId, desiredCount) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Step 1: Lock the session row
      const session = await reelSessionRepo.getSessionForUpdate(client, sessionId);
      if (!session) {
        await client.query('ROLLBACK');
        return { appended: 0, exhausted: false };
      }

      let totalAppended = 0;
      let feedExhausted = false;

      for (let attempt = 0; attempt < reelSessionRepo.MAX_EXTENSION_ATTEMPTS; attempt++) {
        // Step 2: Re-check after lock — is extension still needed?
        const currentLiveCount = await this.getLiveCountUnderLock(client, sessionId);
        if (currentLiveCount >= desiredCount || currentLiveCount >= reelSessionRepo.MAX_SESSION_SIZE) {
          break; // Another request already extended, or we've hit the max
        }

        // Step 3: Get existing post IDs for deduplication
        const existingIds = await this.getPostIdsUnderLock(client, sessionId);

        // Step 4: Generate candidates from feed algorithm
        let candidates;
        try {
          const result = await this.feedSvc.getPersonalizedFeed({
            userId,
            limit: reelSessionRepo.EXTENSION_BATCH_SIZE,
            offset: 0,
            page: 1,
            hashtag: null,
            cursorData: null,
            newerCursorData: null,
          });
          candidates = result.posts || [];
        } catch {
          // Feed algorithm failed — transient, don't mark as exhausted
          break;
        }

        if (candidates.length === 0) {
          // Algorithm returned zero candidates — genuinely exhausted
          feedExhausted = true;
          break;
        }

        // Step 5: Filter candidates
        const candidateIds = candidates
          .map(p => p.id)
          .filter(id => !existingIds.has(id));

        if (candidateIds.length === 0) {
          // All candidates were already in session — algorithm may still have
          // more content on a future call, but this batch was a duplicate.
          // Don't mark as exhausted.
          continue;
        }

        // Step 6: Validate candidates (existence, access, publish status)
        const validIds = await this.validatePostIds(client, candidateIds, userId);
        if (validIds.length === 0) continue; // All invalid, try another batch

        // Step 7: Append atomically
        const { appended } = await reelSessionRepo.appendPostsAtomic(client, sessionId, validIds);
        totalAppended += appended;

        if (appended === 0) continue; // Nothing was actually inserted, try again
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
   * Get live post count within a locked transaction.
   */
  async getLiveCountUnderLock(client, sessionId) {
    const { rows } = await client.query(
      `SELECT COUNT(*) AS live_count
       FROM reel_session_posts rsp
       JOIN posts p ON p.id = rsp.post_id
         AND p.deleted_at IS NULL
         AND p.status = 'published'
       WHERE rsp.session_id = $1`,
      [sessionId]
    );
    return parseInt(rows[0]?.live_count || '0', 10);
  }

  /**
   * Get all post IDs in a session within a locked transaction.
   */
  async getPostIdsUnderLock(client, sessionId) {
    const { rows } = await client.query(
      `SELECT post_id FROM reel_session_posts WHERE session_id = $1`,
      [sessionId]
    );
    return new Set(rows.map(r => r.post_id));
  }

  /**
   * Validate that post IDs exist, are published, not deleted, and user can access them.
   * Returns only the valid IDs.
   */
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

  /**
   * Delete expired sessions (cleanup job).
   * Called by background worker/cron, not by client.
   */
  async cleanupExpiredSessions() {
    return reelSessionRepo.deleteExpiredSessions();
  }
}

module.exports = ReelSessionService;
