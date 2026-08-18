'use strict';

const pushNotificationRepository = require('./pushNotification.repository');
const PushNotificationService = require('./pushNotification.service');
const PushNotificationController = require('./pushNotification.controller');

const pushNotificationService = new PushNotificationService({ pushNotificationRepository });
const pushNotificationController = new PushNotificationController({ pushNotificationService });

module.exports = { pushNotificationController, pushNotificationService, pushNotificationRepository };
