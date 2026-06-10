'use strict';

const { getPaginationParams, paginationMeta } = require('../utils/pagination.util');
const { apiResponse } = require('../utils/response.util');

class SearchController {
  constructor({ searchService }) {
    this.searchSvc = searchService;
  }

  search = async (req, res, next) => {
    try {
      const userId = req.userId;
      const type = req.query.type || 'posts'
      const query = req.query.q || ''
      const filter = req.query.filter || ''
      const { limit, offset, page } = getPaginationParams(req.query);

      const {dataType, data, total} = await this.searchSvc.search({type, query, filter, limit, offset});

      res.json(apiResponse({dataType, data,}, 'Users fetched', paginationMeta(total, page, limit)));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = SearchController;
