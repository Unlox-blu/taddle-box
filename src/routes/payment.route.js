'use strict';

const express = require('express');
const { initPayment } = require('../modules/payment/payment.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/payu/init', verifyToken, initPayment);

module.exports = router;
