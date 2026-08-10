'use strict';

const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redis = require('../config/redis');

const makeStore = (prefix) =>  new RedisStore({ sendCommand: (...args) => redis.call(...args), prefix });

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

// 1 requests per 30 sec — applied on send otp route under auth routes
const otpRateLimiter = rateLimit({
  windowMs:  30 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:otp:'),
  skipFailedRequests: true,
  message: { success: false, message: 'Please try again after 30 sec.' },
});

// 20 uploads per hour
const uploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  store: makeStore('rl:upload:'),
  message: { success: false, message: 'Upload limit reached. Please try again in an hour.' },
});

// 1 capture per 60s — applied on POST /users/location. The client already
// throttles to 5 min; this server-side guard keeps the append-only
// location_history table from being flooded by a misbehaving client.
const locationCaptureLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:loc:'),
  skipFailedRequests: true,
  message: { success: false, message: 'Location capture rate limited. Try again shortly.' },
});

// 120 view records per 10 min, keyed by USER (falls back to IP for
// unauthenticated callers). Defense-in-depth on top of the per-user dedup in
// recordView: a scripted client can still only add ONE view per post per
// account, but this stops it from sweeping the whole post table (or any future
// window-based logic) and from hammering the DB with insert attempts.
const postViewLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:view:'),
  skipFailedRequests: true,
  // verifyToken runs BEFORE this middleware and sets req.userId, so the budget
  // is per account — shared NAT IPs don't throttle each other, and one user's
  // devices share a single budget.
  keyGenerator: (req) => req.userId || req.ip || 'anon',
  message: { success: false, message: 'Too many post views. Please try again later.' },
});

module.exports = { globalRateLimiter, authRateLimiter, otpRateLimiter, uploadRateLimiter, locationCaptureLimiter, postViewLimiter };