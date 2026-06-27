'use strict';

const { apiResponse } = require('../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../utils/pagination.util');

class ActiveStatusController {
  constructor({ activeStatusService }) {
    this.activeStatusSvc = activeStatusService;
  }

  getStatus = async (req, res, next) => {
    try {
      const {userId} = req.params;
      const status = await this.activeStatusSvc.getStatus({userId});
      res.json(apiResponse(status, "status fetched successfuly"));
    } catch (error) {
      next(error);
    }
  };

}

module.exports = ActiveStatusController;
