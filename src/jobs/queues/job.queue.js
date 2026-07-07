'use strict';

const { Queue } = require('bullmq');
const redis = require('../../config/redis');

const jobQueue = new Queue('job', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: 50,
  },
});

const addJob = (type, data) => jobQueue.add(type, data);

module.exports = { jobQueue, addJob };
