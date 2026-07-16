'use strict';

const router = require('express').Router();
const { walletController } = require('../modules/wallet/wallet.container');
const { verifyToken }      = require('../middlewares/auth.middleware');

router.get('/me',                verifyToken,  walletController.getWallet);
router.get('/me/transactions',   verifyToken,  walletController.getTransactions);

// Core Redemption Flows
router.post('/convert-xp',       verifyToken,  walletController.convertXpToCash);
router.post('/withdraw/initiate',verifyToken,  walletController.initiateWithdrawal);

// Webhook for External Backend
router.post('/withdraw/webhook',               walletController.confirmWithdrawalWebhook);

module.exports = router;
