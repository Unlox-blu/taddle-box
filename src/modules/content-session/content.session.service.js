'use strict';

const pool = require('../../config/database');
const PostModel = require('../feed/feed.model');
const contentSessionRepo = require('./content.session.repository');
const { getGenerator } = require('./content.sources');

const PAGE_SIZE = 20;

class ContentSessionService {
  constructor({ feedRepository, feedService }) {
    this.feedRepo = feedRepository;
    this.feedSvc = feedService;
  }

  async createSession(userId, { sourceContext = 'home', presentation = 'feed', sourceContextId, seedContentIds = [], initialContentId } = {}) {
    const generator = getGenerator(sourceContext);
    if (!generator) throw new Error(`Unsupported source context: ${sourceContext}`);

    let items = [];

    if (presentation === 'reels' && seedContentIds.length > 0) {
      const uniqueIds = [...new Set(seedContentIds)].slice(0, contentSessionRepo.MAX_INITIAL_SEED);
      const validIds = await this.validateContentIds(pool, uniqueIds, userId);
      items = validIds.map(id => ({ contentType: 'post', contentId: id }));
    } else {
      const result = await generator.generateContent(this.feedSvc, userId, {
        sourceContextId,
        limit: contentSessionRepo.INITIAL_BATCH_SIZE_HOME,
        paginationContext: null,
        excludedContentIds: new Set(),
      });
      items = result.items;
    }

    if (items.length === 0) {
      return { session: null, posts: [], startIndex: 0 };
    }

    const SESSION_TTL_MS = { feed: 30 * 60 * 1000, reels: 60 * 60 * 1000 };
    const ttlMs = SESSION_TTL_MS[presentation];
    if (ttlMs === undefined) throw new Error(`Unsupported presentation: ${presentation}`);
    const expiresAt = new Date(Date.now() + ttlMs);

    const session = await contentSessionRepo.createSession(
      userId, sourceContext, presentation, sourceContextId, items, expiresAt
    );

    const posts = await contentSessionRepo.getSessionPage(session.id, 0, PAGE_SIZE, userId);
    const formattedPosts = posts.map(PostModel.format).filter(Boolean);

    let startIndex = 0;
    if (initialContentId) {
      const idx = formattedPosts.findIndex((p) => p.id === initialContentId);
      if (idx >= 0) startIndex = idx;
    }

    return {
      session: {
        id: session.id,
        sourceContext: session.source_context,
        presentation: session.presentation,
        createdAt: session.created_at,
        expiresAt: session.expires_at,
      },
      posts: formattedPosts,
      startIndex,
    };
  }

  async loadPage(sessionId, userId, offset = 0, limit = PAGE_SIZE) {
    const session = await contentSessionRepo.getSession(sessionId, userId);
    if (!session) {
      return { posts: [], nextOffset: 0, hasMore: false, error: 'Session not found or expired' };
    }

    const posts = await contentSessionRepo.getSessionPage(sessionId, offset, limit, userId);
    const formattedPosts = posts.map(PostModel.format).filter(Boolean);

    const nextOffset = offset + posts.length;
    const liveCount = await contentSessionRepo.getSessionLiveCount(sessionId);

    let sourceExhausted = false;
    if (posts.length < limit && liveCount < contentSessionRepo.MAX_SESSION_SIZE) {
      const { appended, sourceExhausted: exhausted } = await this.extendSession(session, userId);
      sourceExhausted = exhausted;
      if (appended > 0) {
        const remaining = limit - posts.length;
        const morePosts = await contentSessionRepo.getSessionPage(sessionId, nextOffset, remaining, userId);
        formattedPosts.push(...morePosts.map(PostModel.format).filter(Boolean));
      }
    }

    const finalNextOffset = offset + formattedPosts.length;
    const finalLiveCount = await contentSessionRepo.getSessionLiveCount(sessionId);

    return {
      posts: formattedPosts,
      nextOffset: finalNextOffset,
      hasMore: sourceExhausted ? finalNextOffset < finalLiveCount : true,
      sessionId: session.id,
    };
  }

  /**
   * Extend the session inside a locked transaction.
   *
   * Extension model:
   *   1. FOR UPDATE lock on session
   *   2. Re-check: expired? max size? already enough?
   *   3. Get pagination context from generator
   *   4. Generate candidates
   *   5. Filter: exclude duplicates, validate access
   *   6. Combine hasMore + valid count to determine next action:
   *        - enough valid items → append → done
   *        - not enough + hasMore=true → continue loop
   *        - not enough + hasMore=false → source exhausted
   *        - generator error → stop (don't mark exhausted)
   *   7. Max 3 attempts
   *   8. COMMIT
   */
  async extendSession(session, userId) {
    const generator = getGenerator(session.source_context);
    if (!generator) throw new Error(`Unsupported source context: ${session.source_context}`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock session row
      const lockedSession = await contentSessionRepo.getSessionForUpdate(client, session.id);
      if (!lockedSession) {
        await client.query('ROLLBACK');
        return { appended: 0, sourceExhausted: false };
      }

      // Re-check after lock: is extension still needed?
      const currentLiveCount = await this.getLiveCountUnderLock(client, session.id);
      let remainingCapacity = contentSessionRepo.MAX_SESSION_SIZE - currentLiveCount;
      if (remainingCapacity <= 0) {
        await client.query('COMMIT');
        return { appended: 0, sourceExhausted: false, sessionLimitReached: true };
      }

      let totalAppended = 0;
      let sourceExhausted = false;

      for (let attempt = 0; attempt < contentSessionRepo.MAX_EXTENSION_ATTEMPTS; attempt++) {
        // Get existing IDs for deduplication
        const existingIds = await contentSessionRepo.getSessionContentIds(session.id);

        // Let generator derive its own pagination context
        const paginationContext = await generator.getPaginationContext(session);

        // Cap batch size to remaining capacity
        const batchSize = Math.min(contentSessionRepo.EXTENSION_BATCH_SIZE, remainingCapacity);

        // Generate candidates
        let result;
        try {
          result = await generator.generateContent(this.feedSvc, userId, {
            sourceContextId: session.source_context_id,
            limit: batchSize,
            paginationContext,
            excludedContentIds: existingIds,
          });
        } catch {
          // Transient failure — stop, don't mark as exhausted
          break;
        }

        // Filter: remove items already in session
        const newItems = result.items.filter(item => !existingIds.has(item.contentId));

        // Filter: validate access (deleted, private, etc.)
        let validItems = [];
        if (newItems.length > 0) {
          const validIds = await this.validateContentIds(client, newItems.map(i => i.contentId), userId);
          validItems = newItems.filter(item => validIds.includes(item.contentId));
        }

        // Append valid items
        const { appended } = await contentSessionRepo.appendItemsAtomic(client, session.id, validItems);
        totalAppended += appended;

        // Update remaining capacity
        remainingCapacity -= appended;
        if (remainingCapacity <= 0) {
          break; // Session limit reached
        }

        // Determine next action based on hasMore + actual appended count
        if (appended >= batchSize) {
          // Got a full batch — done for this attempt
          continue;
        }

        // Got fewer than requested — check source state
        if (!result.hasMore) {
          sourceExhausted = true;
          break;
        }
        // Source has more but we got fewer — continue to next attempt
      }

      const sessionLimitReached = remainingCapacity <= 0;
      await client.query('COMMIT');
      return { appended: totalAppended, sourceExhausted, sessionLimitReached };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getLiveCountUnderLock(client, sessionId) {
    const { rows } = await client.query(
      `SELECT COUNT(*) AS live_count
       FROM content_session_items csi
       JOIN posts p ON p.id = csi.content_id
         AND csi.content_type = 'post'
         AND p.deleted_at IS NULL AND p.status = 'published'
       WHERE csi.session_id = $1`,
      [sessionId]
    );
    return parseInt(rows[0]?.live_count || '0', 10);
  }

  async validateContentIds(client, contentIds, userId) {
    if (contentIds.length === 0) return [];
    const { rows } = await client.query(
      `SELECT p.id FROM posts p
       JOIN users u ON u.id = p.author_id
       LEFT JOIN communities c ON p.community_id = c.id
       WHERE p.id = ANY($1::uuid[])
         AND p.deleted_at IS NULL AND p.status = 'published'
         AND (u.privacy = 'public' OR p.author_id = $2
           OR EXISTS (SELECT 1 FROM followers f WHERE f.follower_id = $2 AND f.following_id = p.author_id AND f.status = 'active'))
         AND (p.community_id IS NULL OR c.privacy = 'public'
           OR p.community_id IN (SELECT community_id FROM community_members WHERE user_id = $2 AND status = 'active'))`,
      [contentIds, userId]
    );
    return rows.map(r => r.id);
  }

  async cleanupExpiredSessions() {
    return contentSessionRepo.deleteExpiredSessions();
  }
}

module.exports = ContentSessionService;
