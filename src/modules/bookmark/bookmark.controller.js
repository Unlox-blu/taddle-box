'use strict';

const { apiResponse } = require('../../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../../utils/pagination.util');

class BookmarkController {
  constructor({ bookmarkService }) {
    this.bookmarkSvc = bookmarkService;
  }

  // GET /bookmark?page=&limit=
  getBookmarks = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { limit, offset, page } = getPaginationParams(req.query);
      const { type } = req.query;
      const { searchService } = require('../search/search.container');
      const result = await searchService.universalSearch({
        scope: 'bookmarks',
        type: type || 'all',
        limit,
        offset,
        page,
        userId,
      });
      // The search API already returns { dataType, data, total, hasNext }
      // The frontend expects the paginated results list directly in the response
      res.json(apiResponse(result.data, 'Bookmarks fetched successfully', paginationMeta(result.total, page, limit)));
    } catch (error) {
      next(error);
    }
  };

  // POST /bookmark/toggle  { itemType, itemId }
  toggleBookmark = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { itemType, itemId } = req.body;
      const result = await this.bookmarkSvc.toggle({ userId, itemType, itemId });
      res.json(apiResponse(result, result.bookmarked ? 'Bookmark added' : 'Bookmark removed'));
    } catch (error) {
      next(error);
    }
  };

  // GET /bookmark/check?type=post|profile|community&itemId=xxx
  checkBookmark = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { type: itemType, itemId } = req.query;
      const bookmarked = await this.bookmarkSvc.isBookmarked({ userId, itemType, itemId });
      res.json(apiResponse({ bookmarked }, 'Bookmark status fetched'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = BookmarkController;
