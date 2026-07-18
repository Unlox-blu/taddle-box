'use strict';

const { Queue } = require('bullmq');
const redis = require('../../config/redis');
const { QUEUES } = require('../../modules/notification/notification.constants');

const notificationQueue = new Queue(QUEUES.NOTIFICATION, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 200,
    removeOnFail: 100,
  },
});

const notificationDeliveryQueue = new Queue(QUEUES.NOTIFICATION_DELIVERY, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

const addNotificationJob = (type, data) => notificationQueue.add(type, data);
const addNotificationDeliveryJob = (data, options = {}) => notificationDeliveryQueue.add('push', data, options);

module.exports = { notificationQueue, notificationDeliveryQueue, addNotificationJob, addNotificationDeliveryJob };
