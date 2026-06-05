'use strict';

const { apiResponse } = require('../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../utils/pagination.util');

class FeedController {
  constructor({ feedService }) {
    this.feedSvc = feedService;
  }

  getFeed = async (req, res, next) => {
    try {
      const { limit, offset, page } = getPaginationParams(req.query);
     
      const { posts, total, fromCache } = await this.feedSvc.getPersonalizedFeed(
        req.userId,
        [],
        limit,
        offset,
        page
      );
      res.json(
        apiResponse(
          posts,
          fromCache ? 'Feed fetched (cached)' : 'Feed fetched',
          paginationMeta(total, page, limit)
        )
      );
    } catch (err) {
      next(err);
    }
  };
}

module.exports = FeedController;
