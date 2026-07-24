// Repository
const notificationRepository = require('./notification.repository')

// Service
const NotificationService = require('./notification.service');

// Controller
const NotificationController = require('./notification.controller')

const {activeStatusService} = require('../activestatus/activestatus.container')

const notificationService = new NotificationService({ notificationRepository, pushService: null, activeStatusService });


const notificationController = new NotificationController({ notificationService });

module.exports = {
  notificationController,
  notificationService,
  notificationRepository,
}