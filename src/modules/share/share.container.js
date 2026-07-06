// Repository
const shareRepository = require('./share.repository')

// Service
const ShareService = require('./share.service')

// Controller
const ShareController = require('./share.controller')

// Dependencies from other modules
const taskContainer = require('../task/task.container')
const taskService = taskContainer.taskService


// Instantiate Service
const shareService = new ShareService({ shareRepository })

// Instantiate Controller
const shareController = new ShareController({ shareService })

// Export controller as default, but also export service and repository for other modules
module.exports = {shareController}
