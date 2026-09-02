'use strict';

const { apiResponse } = require('../../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../../utils/pagination.util');

class FeedController {
  constructor({ feedService }) {
    this.feedSvc = feedService;
  }

  getTrendingHashtags = async (req, res, next) => {
    try {
      const hashtags = await this.feedSvc.getTrendingHashtags({ userId: req.userId });
      res.json(apiResponse(hashtags, 'Trending hashtags fetched'));
    } catch (error) {
      next(error);
    }
  };

  getFeed = async (req, res, next) => {
    try {
      const { limit, offset, page, cursorData } = getPaginationParams(req.query);
      const { hashtag } = req.query;
      const userId = req.userId;
      const useCursor = !!req.query.cursor;

      // newerCursor: base64 cursor for "X new reels" banner — returns posts published AFTER this cursor
      const { decodeCursor } = require('../../utils/pagination.util');
      const newerCursorData = decodeCursor(req.query.newerCursor);

      const { posts, total, fromCache } = await this.feedSvc.getPersonalizedFeed({
        userId, limit, offset, page, hashtag, cursorData, newerCursorData,
      });

      const { envelopeItem } = require('../../utils/envelope.util');
      const lastItem = posts.length > 0 ? posts[posts.length - 1] : null;

      // Home feed uses ranked (score-based) cursor pagination
      const isRankedFeed = !hashtag;

      res.json({
        success: true,
        data: {
          items: posts.map(p => envelopeItem('post', p)),
          pagination: paginationMeta(total, page, limit, useCursor, lastItem, isRankedFeed),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Check how many newer posts exist since a given cursor.
  // Returns { count } — the client shows "X new reels" banner.
  getNewerCount = async (req, res, next) => {
    try {
      const { decodeCursor } = require('../../utils/pagination.util');
      const newerCursorData = decodeCursor(req.query.cursor);
      if (!newerCursorData) {
        return res.json({ success: true, data: { count: 0 } });
      }

      const userId = req.userId;
      const { posts } = await this.feedSvc.getPersonalizedFeed({
        userId, limit: 100, offset: 0, page: 1, hashtag: null, newerCursorData,
      });

      res.json({
        success: true,
        data: { count: posts.length },
      });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = FeedController;
