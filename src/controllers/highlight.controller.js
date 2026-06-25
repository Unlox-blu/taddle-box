'use strict';

const { getPaginationParams, paginationMeta } = require('../utils/pagination.util');
const { apiResponse } = require('../utils/response.util');

class HighlightController {
  constructor({ highlightService }) {
    this.highlightSvc = highlightService;
  }

  getSpotligth = async (req, res, next) => {
    try {
      const { limit, offset, page } = getPaginationParams(req.query);
      const { spotligth, total } = await this.highlightSvc.getSpotligth({ limit, offset });
      res.json(
        apiResponse(spotligth, 'Spotligth fetched successfully', paginationMeta(total, page, limit))
      );
    } catch (error) {
      next(error);
    }
  };
}

module.exports = HighlightController;
