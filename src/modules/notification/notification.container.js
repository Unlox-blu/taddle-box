// Repository
const notificationRepository = require('./notification.repository')

// Service
const NotificationService = require('./notification.service')

// Controller
const NotificationController = require('./notification.controller')


// Instantiate Service
const notificationService = new NotificationService({ notificationRepository })

// Instantiate Controller
const notificationController = new NotificationController({ notificationService })


module.exports = {notificationController, notificationService, notificationRepository}