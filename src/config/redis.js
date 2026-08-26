'use strict';

const Redis = require('ioredis');
const config = require('./app.config');

const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

const { logger } = require('../middlewares/logger.middleware');

redis.on('error', (err) => logger.error('Redis error:', { error: err.message }));
redis.on('reconnecting', () => logger.warn('Redis reconnecting...'));

module.exports = redis;
