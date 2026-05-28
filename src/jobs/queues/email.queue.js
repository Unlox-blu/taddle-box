'use strict';

const { Queue } = require('bullmq');
const redis = require('../../config/redis');

const emailQueue = new Queue('email', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

const addEmailJob = (type, data) => emailQueue.add(type, data);

module.exports = { emailQueue, addEmailJob };
