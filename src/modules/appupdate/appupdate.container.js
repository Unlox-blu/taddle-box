'use strict';

const AppUpdateService = require('./appupdate.service');
const AppUpdateController = require('./appupdate.controller');
const storageService = require('../../integrations/storage/storage.service');

const appUpdateService = new AppUpdateService({ storageService });
const appUpdateController = new AppUpdateController({ appUpdateService });

module.exports = { appUpdateController, appUpdateService };
