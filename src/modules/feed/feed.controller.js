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
      const { limit, offset, page } = getPaginationParams(req.query);
      const { hashtag } = req.query;
      const userId = req.userId
      const { posts, total, fromCache } = await this.feedSvc.getPersonalizedFeed( {userId, limit, offset, page, hashtag} );
      res.json(
        apiResponse(
          posts,
          fromCache ? 'Feed fetched (cached)' : 'Feed fetched',
          paginationMeta(total, page, limit)
        )
      );
    } catch (error) {
      next(error);
    }
  };
}

module.exports = FeedController;
