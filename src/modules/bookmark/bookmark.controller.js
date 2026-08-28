'use strict';

const { apiResponse } = require('../../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../../utils/pagination.util');

class BookmarkController {
  constructor({ bookmarkService }) {
    this.bookmarkSvc = bookmarkService;
  }

  // GET /bookmark?page=&limit=
  // Directly queries the bookmark table — bypasses the search engine's
  // visibility/privacy filters so bookmarked items always appear.
  getBookmarks = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { limit, offset, page } = getPaginationParams(req.query);
      const result = await this.bookmarkSvc.getBookmarks({
        userId,
        limit,
        offset,
      });
      const { envelopeItem } = require('../../utils/envelope.util');
      res.json({
        success: true,
        message: 'Bookmarks fetched successfully',
        data: {
          items: result.bookmark.map(b => envelopeItem(b.itemType || 'post', b)),
          pagination: paginationMeta(result.total, page, limit),
          types: []
        }
      });
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
