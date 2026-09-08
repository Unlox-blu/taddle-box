'use strict';

// ─── src/routes/xp.route.js ──────────────────────────────────────────────
const router = require('express').Router();
const { xpController } = require('../modules/xp/xp.container');
const { verifyToken }      = require('../middlewares/auth.middleware');
const { validateRequest }         = require('../middlewares/validator.middleware');
const { xpClaimRateLimiter }   = require('../middlewares/rate-limiter.middleware');
const { claimXPSchema, paginationQuerySchema } = require('../modules/xp/xp.validator');

router.post('/',                 verifyToken,                                                       xpController.createXPwallet);
router.get('/',                  verifyToken,                                                       xpController.getXP);
router.get('/transactions',      verifyToken, validateRequest({ query: paginationQuerySchema }),   xpController.getTransactions);
router.get('/daily-login-status', verifyToken, xpController.getDailyLoginStatus);
router.post('/claim',            verifyToken, xpClaimRateLimiter, validateRequest({ body: claimXPSchema }), xpController.claimReward);

module.exports = router;