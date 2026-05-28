'use strict';

const crypto = require('crypto');
const razorpay = require('../../config/razorpay');
const config = require('../../config/app.config');

// Creates a Razorpay order.
const createOrder = async (amountCents, currency = 'INR', receipt, notes = {}) => {
  const order = await razorpay.orders.create({
    amount: amountCents,
    currency,
    receipt: receipt.slice(0, 40),
    notes,
  });
  return { id: order.id, amount: order.amount, currency: order.currency };
};

// Verifies Razorpay webhook signature using HMAC-SHA256.
// MUST be called on raw body string (not parsed JSON).
const verifyWebhookSignature = (rawBody, signature) => {
  const expected = crypto
    .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};

// Verifies Razorpay payment signature after checkout.
// orderId + '|' + paymentId signed with key_secret.
const verifyPaymentSignature = (orderId, paymentId, signature) => {
  const body = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac('sha256', config.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};

module.exports = { createOrder, verifyWebhookSignature, verifyPaymentSignature };
