'use strict';

const { apiResponse } = require('../../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../../utils/pagination.util');

class BookmarkController {
  constructor({ bookmarkService }) {
    this.bookmarkSvc = bookmarkService;
  }

  getBookmarks = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { limit, offset, page } = getPaginationParams(req.query);
      const { bookmark, total } = await this.bookmarkSvc.getBookmarks({userId, limit, offset});
      res.json(apiResponse(bookmark, "Bookmark fetched successfuly", paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  };

}

module.exports = BookmarkController;
