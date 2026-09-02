'use strict';

class FeedSessionController {
  constructor({ feedSessionService }) {
    this.feedSvc = feedSessionService;
  }

  /**
   * POST /feed/sessions
   * Create a new feed session.
   *
   * Body:
   *   - context: 'home' | 'profile' | 'bookmarks' | 'community' | 'search' | 'reels'
   *   - seedPostIds: string[] (required for 'reels')
   *   - initialPostId: string (optional, for 'reels')
   *   - feedContextId: string (optional, for 'profile'/'community')
   *   - hashtag: string (optional, for 'home')
   */
  createSession = async (req, res, next) => {
    try {
      const userId = req.userId;
      const {
        context = 'home',
        seedPostIds = [],
        initialPostId,
        feedContextId,
        hashtag,
      } = req.body || {};

      const result = await this.feedSvc.createSession(userId, {
        context,
        seedPostIds,
        initialPostId,
        feedContextId,
        hashtag,
      });

      res.json({
        success: true,
        data: {
          session: result.session,
          posts: result.posts,
          startIndex: result.startIndex,
          skippedCount: result.skippedCount,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /feed/sessions/:sessionId
   * Load a page of posts from an existing session.
   * Auto-extends when exhausted (append-only).
   *
   * Query params: offset (default 0), limit (default 20)
   */
  loadPage = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { sessionId } = req.params;
      const offset = parseInt(req.query.offset, 10) || 0;
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

      const result = await this.feedSvc.loadPage(sessionId, userId, offset, limit);

      if (result.error) {
        return res.status(404).json({
          success: false,
          error: result.error,
        });
      }

      const { envelopeItem } = require('../../utils/envelope.util');

      res.json({
        success: true,
        data: {
          items: result.posts.map((p) => envelopeItem('post', p)),
          pagination: {
            nextOffset: result.nextOffset,
            hasMore: result.hasMore,
            sessionId: result.sessionId,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = FeedSessionController;
