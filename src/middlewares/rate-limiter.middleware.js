'use strict';

const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redis = require('../config/redis');

const makeStore = (prefix) =>
  new RedisStore({ sendCommand: (...args) => redis.call(...args), prefix });

// 100 requests per 15 min — applied globally 
const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:global:'),
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

// 10 requests per 15 min — applied on auth routes
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:auth:'),
  message: { success: false, message: 'Too many auth attempts. Please try again later.' },
});

// 20 uploads per hour
const uploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  store: makeStore('rl:upload:'),
  message: { success: false, message: 'Upload limit reached. Please try again in an hour.' },
});

module.exports = { globalRateLimiter, authRateLimiter, uploadRateLimiter };
