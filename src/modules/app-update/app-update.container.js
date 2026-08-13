'use strict';

const AppUpdateService = require('./app-update.service');
const AppUpdateController = require('./app-update.controller');
const storageService = require('../../integrations/storage/storage.service');

const appUpdateService = new AppUpdateService({ storageService });
const appUpdateController = new AppUpdateController({ appUpdateService });

module.exports = { appUpdateController, appUpdateService };
