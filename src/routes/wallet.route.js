'use strict';

const router = require('express').Router();
const { walletController } = require('../modules/wallet/wallet.container');
const { verifyToken }      = require('../middlewares/auth.middleware');

router.get('/me',                verifyToken,  walletController.getWallet);
router.get('/me/transactions',   verifyToken,  walletController.getTransactions);

// Core Redemption Flows
router.post('/upi',              verifyToken,  walletController.linkUPI);
router.post('/convert-xp',       verifyToken,  walletController.convertXpToCash);
router.post('/convert-cash-xp',  verifyToken,  walletController.convertCashToXp);
router.post('/withdraw/initiate',verifyToken,  walletController.initiateWithdrawal);

// Recharge (PayU) — init returns the auto-submit HTML form; result is the
// public redirect target PayU bounces the WebView to.
router.post('/recharge/init',    verifyToken,  walletController.initiateRecharge);
router.all('/recharge/result',                 walletController.completeRecharge);

module.exports = router;
