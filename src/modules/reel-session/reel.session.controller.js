'use strict';

class ReelSessionController {
  constructor({ reelSessionService }) {
    this.reelSvc = reelSessionService;
  }

  /**
   * POST /reels/session
   * Create a new Reel session using seed posts from the client.
   *
   * Body:
   *   - seedPostIds: string[] — Ordered post IDs from the Home Feed
   *   - feedContext: string — 'home', 'profile', 'bookmarks', 'community', 'search'
   *   - initialPostId: string — The post the user tapped on
   */
  createSession = async (req, res, next) => {
    try {
      const userId = req.userId;       const { seedPostIds = [], feedContext = 'home', initialPostId } = req.body || {};

      const result = await this.reelSvc.createSession(userId, {
        seedPostIds,
        feedContext,
        initialPostId,
      });

      res.json({
        success: true,
        data: {
          session: result.session,
          posts: result.posts,
          startIndex: result.startIndex,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /reels/session/:sessionId
   * Load a page of posts from an existing session.
   * Auto-extends the session when exhausted (append-only).
   * Returns 404 if session has expired.
   *
   * Query params: offset (default 0), limit (default 20)
   */
  loadPage = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { sessionId } = req.params;
      const offset = parseInt(req.query.offset, 10) || 0;
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

      const result = await this.reelSvc.loadPage(sessionId, userId, offset, limit);

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

module.exports = ReelSessionController;
