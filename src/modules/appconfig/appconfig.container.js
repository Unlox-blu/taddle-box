// Repository
const appConfigRepository = require('./appconfig.repository')

// Service
const AppConfigService = require('./appconfig.service')

// Controller
const AppConfigController = require('./appconfig.controller')


// Instantiate Service
const appConfigService = new AppConfigService({ appConfigRepository })

// Instantiate Controller
const appConfigController = new AppConfigController({ appConfigService })


module.exports = {appConfigController, appConfigService, appConfigRepository}