'use strict';

class ContentSessionController {
  constructor({ contentSessionService }) {
    this.contentSvc = contentSessionService;
  }

  /**
   * POST /content/sessions
   * Create a new content session.
   *
   * Body:
   *   - sourceContext: 'home' | 'profile' | 'bookmarks' | 'community' | 'search'
   *   - presentation: 'feed' | 'reels'
   *   - seedContentIds: string[] (required for 'reels')
   *   - initialContentId: string (optional, for 'reels')
   *   - feedContextId: string (optional, for 'profile'/'community')
   *   - hashtag: string (optional, for 'home')
   */
  // Valid enums at the API boundary
  static VALID_SOURCE_CONTEXTS = ['home', 'profile', 'bookmarks', 'community', 'search'];
  static VALID_PRESENTATIONS = ['feed', 'reels'];

  createSession = async (req, res, next) => {
    try {
      const userId = req.userId;
      const {
        sourceContext = 'home',
        presentation = 'feed',
        seedContentIds = [],
        initialContentId,
        feedContextId,
        hashtag,
      } = req.body || {};

      // Validate enums
      if (!FeedSessionController.VALID_SOURCE_CONTEXTS.includes(sourceContext)) {
        return res.status(400).json({
          success: false,
          error: `Invalid sourceContext: ${sourceContext}. Must be one of: ${FeedSessionController.VALID_SOURCE_CONTEXTS.join(', ')}`,
        });
      }
      if (!FeedSessionController.VALID_PRESENTATIONS.includes(presentation)) {
        return res.status(400).json({
          success: false,
          error: `Invalid presentation: ${presentation}. Must be one of: ${FeedSessionController.VALID_PRESENTATIONS.join(', ')}`,
        });
      }

      const result = await this.contentSvc.createSession(userId, {
        sourceContext,
        presentation,
        seedContentIds,
        initialContentId,
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
   * GET /content/sessions/:sessionId
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

      const result = await this.contentSvc.loadPage(sessionId, userId, offset, limit);

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
          sessionId: result.sessionId,
          items: result.posts.map((p) => envelopeItem('post', p)),
          pagination: {
            nextOffset: result.nextOffset,
            hasMore: result.hasMore,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = ContentSessionController;
