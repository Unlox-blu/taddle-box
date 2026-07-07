'use strict';

// ─── src/routes/wallet.route.js ──────────────────────────────────────────────
const router = require('express').Router();
const { walletController } = require('../modules/wallet/wallet.container');
const { verifyToken }      = require('../middlewares/auth.middleware');
const { validate }         = require('../middlewares/validator.middleware');
const { topupSchema }      = require('../modules/wallet/wallet.validator');

router.get('/me',                verifyToken, walletController.getWallet);
router.get('/me/transactions',   verifyToken, walletController.getTransactions);
router.post('/topup',            verifyToken, validate(topupSchema), walletController.createTopup);

module.exports = router;
