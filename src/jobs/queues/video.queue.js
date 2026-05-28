'use strict';

const { Queue } = require('bullmq');
const redis = require('../../config/redis');

const videoQueue = new Queue('video', {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 50,
    removeOnFail: 50,
  },
});

const addVideoJob = (type, data, opts = {}) => videoQueue.add(type, data, opts);

module.exports = { videoQueue, addVideoJob };
