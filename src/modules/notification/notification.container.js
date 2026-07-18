// Repository
const notificationRepository = require('./notification.repository')

// Service
const notificationStatus = require('./notification.status')
const NotificationService = require('./notification.service');

// Controller
const NotificationController = require('./notification.controller')

const notificationService = new NotificationService({ notificationRepository, pushService: null,  });


const notificationController = new NotificationController({ notificationService });

module.exports = {
  notificationController,
  notificationService,
  notificationRepository,
  notificationStatus,
}