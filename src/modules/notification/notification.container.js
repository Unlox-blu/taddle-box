// Repository
const notificationRepository = require('./notification.repository')

// Service
const NotificationService = require('./notification.service')

// Controller
const NotificationController = require('./notification.controller')

// Dependency from another module
const {pushService} = require('../push/push.container')


// Instantiate Service
const notificationService = new NotificationService({ notificationRepository, pushService })

// Instantiate Controller
const notificationController = new NotificationController({ notificationService })


module.exports = {notificationController, notificationService, notificationRepository}