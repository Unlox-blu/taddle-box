'use strict';

const { apiResponse } = require('../utils/response.util');
const config = require('../config/app.config')

class AppConfigController {
  constructor({ appConfigService }) {
    this.appConfigSvc = appConfigService;
  }

  getAppConfig = async (req, res, next) => {
    try {
      const appConfig = await this.appConfigSvc.getAppConfig();
      res.json(apiResponse(appConfig, 'App configuration fetched successfully'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = AppConfigController;
