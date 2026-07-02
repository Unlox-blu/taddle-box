// Repository
const xpRepository = require('./xp.repository')

// Service
const XPService = require('./xp.service')

// Controller
const XPController = require('./xp.controller')


// Instantiate Service
const xpService = new XPService({ xpRepository })

// Instantiate Controller
const xpController = new XPController({ xpService })

// Export controller as default, but also export service and repository for other modules
module.exports = {xpController, xpService}
