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
      const community = req.query.community || null
      // Person filter — comma-separated usernames (@a @b in the search box).
      const author = req.query.author
        ? String(req.query.author).split(',').map(s => s.trim()).filter(Boolean)
        : null
      // Involvement dimension (authored | mentions | comments | reposts).
      const involvement = req.query.involvement || null
      // Hashtag filter — comma-separated tags (#a #b in the search box).
      const tag = req.query.tag
        ? String(req.query.tag).split(',').map(s => s.trim().replace(/^#/, '').toLowerCase()).filter(Boolean)
        : null
      // Bookmarks scope (saved posts) and own-posts (settings) scope.
      const bookmarked = req.query.bookmarked || null
      const mine = req.query.mine || null
      const sortBy = req.query.sortBy || req.query.sort_by || 'relevance';
      const postFilter = req.query.post_filter || 'all';
      const { limit, offset, page } = getPaginationParams(req.query);

      const {dataType, data, total} = await this.searchSvc.search({
        type, 
        query, 
        filter, 
        limit, 
        offset, 
        page, 
        userId, 
        community, 
        author, 
        involvement, 
        tag, 
        bookmarked, 
        mine, 
        sortBy,
        postFilter
      });

      res.json(apiResponse({dataType, data,}, `${dataType} fetched`, paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  };

  // Dedicated combined search for the app's "All" tab — one request returns
  // people, communities, events, games, posts and hashtags at once.
  searchAll = async (req, res, next) => {
    try {
      const userId = req.userId;
      const query = req.query.q || ''
      const filter = req.query.filter || ''
      const community = req.query.community || null
      // Person filter — comma-separated usernames (@a @b in the search box).
      const author = req.query.author
        ? String(req.query.author).split(',').map(s => s.trim()).filter(Boolean)
        : null
      // Involvement dimension (authored | mentions | comments | reposts).
      const involvement = req.query.involvement || null
      // Hashtag filter — comma-separated tags (#a #b in the search box).
      const tag = req.query.tag
        ? String(req.query.tag).split(',').map(s => s.trim().replace(/^#/, '').toLowerCase()).filter(Boolean)
        : null
      // Bookmarks scope (saved posts) and own-posts (settings) scope.
      const bookmarked = req.query.bookmarked || null
      const mine = req.query.mine || null
      const sortBy = req.query.sortBy || req.query.sort_by || 'relevance';
      const postFilter = req.query.post_filter || 'all';
      const { limit, offset, page } = getPaginationParams(req.query);

      const {dataType, data, total} = await this.searchSvc.search({type: 'all', query, filter, limit, offset, userId, community, author, involvement, tag, bookmarked, mine, sortBy, postFilter});

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
