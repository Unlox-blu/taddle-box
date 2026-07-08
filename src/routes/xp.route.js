'use strict';

// ─── src/routes/wallet.route.js ──────────────────────────────────────────────
const router = require('express').Router();
const { xpController } = require('../modules/xp/xp.container');
const { verifyToken }      = require('../middlewares/auth.middleware');
const { validateRequest }         = require('../middlewares/validator.middleware');
const { creditOrdebitXPSchema } = require('../modules/xp/xp.validator');

router.post('/',                 verifyToken,                                   xpController.createXPwallet);
router.get('/',                  verifyToken,                                   xpController.getXP);
router.get('/transactions',      verifyToken,                                   xpController.getTransactions);
router.post('/credit',           verifyToken, validateRequest({ body: creditOrdebitXPSchema }),  xpController.creditXP);
router.post('/debit',            verifyToken, validateRequest({ body: creditOrdebitXPSchema }),  xpController.debitXP);

module.exports = router;
