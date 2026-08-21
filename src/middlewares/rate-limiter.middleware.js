'use strict';

const crypto = require('crypto');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redis = require('../config/redis');

const makeStore = (prefix) =>  new RedisStore({ sendCommand: (...args) => redis.call(...args), prefix });

// Shared key strategy for every limiter that can see an authenticated caller:
// a per-account budget when verifyToken has run (it sets req.userId), otherwise
// a normalized IP key. The IP fallback MUST go through ipKeyGenerator so IPv6
// addresses are bucketed by their /56 subnet (matching the ipv6Subnet default)
// — a raw address would let one attacker rotate IPv6 addresses and bypass the
// budget entirely. 'anon' only ever appears when neither value exists.
const accountOrIpKey = (req) => req.userId || ipKeyGenerator(req.ip) || 'anon';

// For pre-auth routes (no token can exist) — normalized IP only.
const ipOnlyKey = (req) => ipKeyGenerator(req.ip) || 'anon';

// 100 requests per 15 min — applied globally (currently DISABLED in app.js;
// kept hardened so enabling it is a one-line change).
const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:global:'),
  keyGenerator: accountOrIpKey,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

// 10 requests per 15 min — applied on auth routes (all pre-auth today, so no
// per-account key is possible; normalized IP only).
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:auth:'),
  keyGenerator: ipOnlyKey,
  message: { success: false, message: 'Too many auth attempts. Please try again later.' },
});

// 1 request per 30 sec per SOURCE — applied on send-otp. Stops a single client
// from hammering the endpoint, but alone it can't stop a distributed attacker
// from spamming OTP texts to one victim (see otpTargetRateLimiter below).
const otpRateLimiter = rateLimit({
  windowMs:  30 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:otp:'),
  skipFailedRequests: true,
  keyGenerator: ipOnlyKey,
  message: { success: false, message: 'Please try again after 30 sec.' },
});

// 3 sends per 10 min per RECIPIENT — layered on top of otpRateLimiter. The
// send-otp body always carries email + phone (schema-required), so keying by
// the hashed recipient caps SMS/email OTP spam at the target regardless of how
// many sources are used (SMS-cost abuse + harassment protection). The hash
// keeps PII out of the Redis keys. Missing/unparseable body falls back to the
// IP key (validation runs after this middleware).
const otpTargetRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:otp-target:'),
  skipFailedRequests: true,
  keyGenerator: (req) => {
    const { email, phone } = req.body || {};
    if (email || phone) {
      return crypto.createHash('sha256').update(`${email || ''}|${phone || ''}`).digest('hex').slice(0, 24);
    }
    return ipOnlyKey(req);
  },
  message: { success: false, message: 'Too many OTP requests for this account. Please try again later.' },
});

// 100 requests per min per ACCOUNT — search runs the heaviest queries in the
// app (FTS + trigram scans across posts/users/communities), so a per-account
// budget stops scrapers/scripts from hammering it while leaving plenty of
// room for legit typing + infinite scroll (verifyToken sets req.userId).
const searchRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:search:'),
  keyGenerator: accountOrIpKey,
  message: { success: false, message: 'Too many search requests. Please try again shortly.' },
});

// 600 requests per min per IP — /app-assets is a public static proxy (no
// auth on it), so the budget is IP-keyed. Generous for a device loading the
// logo grid + sounds (a burst of ~7-20 files), but stops a scraper from
// hammering the S3 proxy. Applied at the /app-assets mount in app.js.
const assetRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:asset:'),
  keyGenerator: ipOnlyKey,
  message: { success: false, message: 'Too many asset requests. Please try again shortly.' },
});

// 20 uploads per hour — runs AFTER verifyToken on the media routes, so the
// budget is per ACCOUNT: a NAT'd office/campus no longer shares one bucket,
// and rotating IPs can't stretch the upload cap.
const uploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  store: makeStore('rl:upload:'),
  keyGenerator: accountOrIpKey,
  message: { success: false, message: 'Upload limit reached. Please try again in an hour.' },
});

// 1 capture per 60s — applied on POST /users/location (runs AFTER verifyToken,
// so per-account). The client already throttles to 5 min; this server-side
// guard keeps the append-only location_history table from being flooded by a
// misbehaving client. The IP fallback covers requests that slip through
// without a resolved account.
const locationCaptureLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:loc:'),
  skipFailedRequests: true,
  keyGenerator: accountOrIpKey,
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
  keyGenerator: accountOrIpKey,
  message: { success: false, message: 'Too many post views. Please try again later.' },
});

// 5 attempts per 15 min per ACCOUNT — applied on PIN verify. Stops brute
// forcing a 4-digit PIN (10k combos). bcrypt is slow but not slow enough
// against a distributed attack; this caps the total attempts.
const pinVerifyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:pin-verify:'),
  keyGenerator: accountOrIpKey,
  message: { success: false, message: 'Too many PIN attempts. Please try again in 15 minutes.' },
});

// 3 attempts per 15 min per ACCOUNT — applied on Remove PIN verify.
// Stricter than pinVerify because this endpoint wipes the lock entirely.
const pinRemoveRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:pin-remove:'),
  keyGenerator: accountOrIpKey,
  message: { success: false, message: 'Too many remove PIN attempts. Please try again in 15 minutes.' },
});

module.exports = {
  globalRateLimiter,
  authRateLimiter,
  searchRateLimiter,
  assetRateLimiter,
  otpRateLimiter,
  otpTargetRateLimiter,
  uploadRateLimiter,
  locationCaptureLimiter,
  postViewLimiter,
  pinVerifyRateLimiter,
  pinRemoveRateLimiter,
};
