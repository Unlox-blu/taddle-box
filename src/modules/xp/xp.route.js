'use strict';

// ─── src/routes/wallet.route.js ──────────────────────────────────────────────
const router = require('express').Router();
const { xpController } = require('./xp.container');
const { verifyToken }      = require('../../middlewares/auth.middleware');
const { validate }         = require('../../middlewares/validator.middleware');
const { creditOrdebitXPSchema } = require('./xp.validator');

router.post('/',                 verifyToken,                                   xpController.createXPwallet);
router.get('/',                  verifyToken,                                   xpController.getXP);
router.get('/transactions',      verifyToken,                                   xpController.getTransactions);
router.post('/credit',           verifyToken, validate(creditOrdebitXPSchema),  xpController.creditXP);
router.post('/debit',            verifyToken, validate(creditOrdebitXPSchema),  xpController.debitXP);

module.exports = router;
