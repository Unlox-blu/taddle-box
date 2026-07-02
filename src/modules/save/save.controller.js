'use strict';

const { apiResponse } = require('../../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../../utils/pagination.util');

class SaveController {
  constructor({ saveService }) {
    this.saveSvc = saveService;
  }

  getSave = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { limit, offset, page } = getPaginationParams(req.query);
      const { saved, total } = await this.saveSvc.getSave({userId, limit, offset});
      res.json(apiResponse(saved, "Saved fetched successfuly", paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  }
  
}

module.exports = SaveController;
