// Repository
const streakRepository = require('./streak.repository')

// Service
const StreakService = require('./streak.service')

// Controller
const StreakController = require('./streak.controller')

// Dependencies from other modules
const taskContainer = require('../task/task.container')
const taskService = taskContainer.taskService


// Instantiate Service
const streakService = new StreakService({ streakRepository, taskService })

// Instantiate Controller
const streakController = new StreakController({ streakService })

// Export controller as default, but also export service and repository for other modules
module.exports = {streakController}
