// Repository
const saveRepository = require('./save.repository')

// Service
const SaveService = require('./save.service')

// Controller
const SaveController = require('./save.controller')


// Instantiate Service
const saveService = new SaveService({ saveRepository })

// Instantiate Controller
const saveController = new SaveController({ saveService })

// Export controller as default, but also export service and repository for other modules
module.exports = {saveController, saveService, saveRepository}
