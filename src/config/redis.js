'use strict';

const Redis = require('ioredis');
const config = require('./app.config');

const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

redis.on('connect', () => console.info('Redis connecting...'));
redis.on('ready', () => console.info('Redis ready'));
redis.on('error', (err) => console.error('Redis error:', err.message));
redis.on('reconnecting', () => console.warn('Redis reconnecting...'));

module.exports = redis;
