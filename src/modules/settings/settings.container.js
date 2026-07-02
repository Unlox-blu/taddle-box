// Repository
const settingsRepository = require('./settings.repository')

// Service
const SettingsService = require('./settings.service')

// Controller
const SettingsController = require('./settings.controller')


// Instantiate Service
const settingsService = new SettingsService({ settingsRepository })

// Instantiate Controller
const settingsController = new SettingsController({ settingsService })

// Export controller as default, but also export service and repository for other modules
module.exports = {settingsController}