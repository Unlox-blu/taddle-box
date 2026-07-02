// Repository
const taskRepository = require('./task.repository')

// Service
const TaskService = require('./task.service')

// Controller
const TaskController = require('./task.controller')

// Dependencies from other modules
const {xpService} = require('../xp/xp.container')


// Instantiate Service
const taskService = new TaskService({ taskRepository, xpService })

// Instantiate Controller
const taskController = new TaskController({ taskService })

// Export controller as default, but also export service and repository for other modules
module.exports = {taskController, taskService}