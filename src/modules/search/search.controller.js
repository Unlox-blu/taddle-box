'use strict';

const { getPaginationParams, paginationMeta } = require('../../utils/pagination.util');
const { apiResponse } = require('../../utils/response.util');

class SearchController {
  constructor({ searchService }) {
    this.searchSvc = searchService;
  }

  // Unified search — the ONLY search endpoint. URL shape:
  //   search/?q=&sort=&filter=[c/x, @y, #z]&type=&bookmarked=&page=&limit=
  // The TIME window is a BARE token in the URL — `search/?sort=relevance&all_time`.
  // Returns the available result `types` (pills) plus an ordered, heterogeneous
  // `results` list the client renders verbatim.
  search = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { limit, offset, page } = getPaginationParams(req.query);
      const { dataType, data, total, hasNext } = await this.searchSvc.universalSearch({
        scope: req.query.scope || 'global',
        filter: req.query.filter || '',
        q: req.query.q || '',
        sort: req.query.sort || 'relevance',
        time: req.query.time || 'all_time',
        type: req.query.type || '',
        page,
        limit,
        offset,
        userId,
      });
      const meta = paginationMeta(total, page, limit);
      // The mixed/discovery view paginates PER TYPE — the summed-total formula
      // would keep hasNext true after a type is exhausted, so the service's
      // per-group hasNext wins.
      meta.hasNext = hasNext;
      res.json({
        success: true,
        message: `${dataType} fetched`,
        data: {
          query: req.query.q || '',
          items: data.results,
          types: data.types,
          filter: data.filter,
          pagination: meta
        }
      });
    } catch (error) {
      next(error);
    }
  };

  // Mention-autocomplete suggestions — a DEDICATED people endpoint for the
  // composer's @mention autocomplete.
  suggestPeople = async (req, res, next) => {
    try {
      const q = req.query.q || '';
      const limit = Math.min(parseInt(req.query.limit, 10) || 10, 20);
      const rows = await this.searchSvc.suggestPeople(q, limit);
      res.json(apiResponse({ dataType: 'people', data: rows }, 'People fetched'));
    } catch (error) {
      next(error);
    }
  };

  getHashtags = async (req, res, next) => {
    try {
      const q = req.query.q || '';
      const hashtags = await this.searchSvc.getHashtags(q);
      res.json(apiResponse({ dataType: 'hashtags', data: hashtags }, `Hashtags fetched`));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = SearchController;
