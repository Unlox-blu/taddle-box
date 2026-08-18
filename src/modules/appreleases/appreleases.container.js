'use strict';

const AppReleasesService = require('./appreleases.service');
const AppReleasesController = require('./appreleases.controller');
const storageService = require('../../integrations/storage/storage.service');

const appReleasesService = new AppReleasesService({ storageService });
const appReleasesController = new AppReleasesController({ appReleasesService });

module.exports = { appReleasesController, appReleasesService };
