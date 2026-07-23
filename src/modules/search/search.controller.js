'use strict';

const { getPaginationParams, paginationMeta } = require('../../utils/pagination.util');
const { apiResponse } = require('../../utils/response.util');

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

      res.json(apiResponse({dataType, data,}, `${dataType} fetched`, paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  };

  getHashtags = async (req, res, next) => {
    try {
      const q = req.query.q || '';
      const hashtags = await this.searchSvc.getHashtags(q);
      res.json(apiResponse({dataType: 'hashtags', data: hashtags}, `Hashtags fetched`));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = SearchController;
