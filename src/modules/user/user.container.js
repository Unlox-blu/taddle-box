// Repository
const userRepository = require('./user.repository')
const followerRepository = require('./followers.repository')

// Service
const UserService = require('./user.service')

// Controller
const UserController = require('./user.controller')

// Dependencies from other modules
const {taskService} = require('../task/task.container')
const {bookmarkService} = require('../bookmark/bookmark.container')
const {saveService} = require('../save/save.container')

// Integrations
const storageIntegration = require('../../integrations/storage/storage.service')

// Instantiate Service
const userService = new UserService({
  userRepository,
  followerRepository,
  bookmarkService,
  saveService,
  storageIntegration,
  taskService
})

// Instantiate Controller
const userController = new UserController({ userService })

// Export controller as default, but also export service and repository for other modules
module.exports = {userController, userService, userRepository, followerRepository}