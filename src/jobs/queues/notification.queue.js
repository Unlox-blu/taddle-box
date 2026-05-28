'use strict';

const { Queue } = require('bullmq');
const redis = require('../../config/redis');

const notificationQueue = new Queue('notification', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 200,
    removeOnFail: 100,
  },
});

const addNotificationJob = (type, data) => notificationQueue.add(type, data);

module.exports = { notificationQueue, addNotificationJob };
