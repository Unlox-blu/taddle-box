'use strict';

const { Queue } = require('bullmq');
const redis = require('../../config/redis');

const jobQueue = new Queue('job', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: {
      age: 120,
      count: 2,
    },
    removeOnFail: {
      age: 60*60
    },
  },
});

const addJob = (type, data,  options = {}) => jobQueue.add(type, data, options);

module.exports = { jobQueue, addJob };
