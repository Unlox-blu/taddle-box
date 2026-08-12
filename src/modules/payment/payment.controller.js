'use strict';

const { buildPaymentForm, newTxnId } = require('../../integrations/payment/payu.service');
const config = require('../../config/app.config');

// Legacy PayU init used for paid events. The app now pays for events with XP
// (see event.service register), so this endpoint is kept for compatibility
// only — wallet recharge uses /wallet/recharge/init instead.
const initPayment = async (req, res, next) => {
  try {
    const { eventId, amount } = req.body;

    if (!eventId || !amount) {
      return res.status(400).json({ success: false, message: 'eventId and amount are required' });
    }

    // In a real app, you'd fetch the user's name/email from the DB
    const firstname = 'TestUser';
    const email = 'test@example.com';
    const phone = '9999999999';
    const productinfo = `Event Registration: ${eventId}`;
    const txnid = newTxnId('EVT');
    const surl = `${config.BASE_URL}/api/v1/payments/payu/success`;
    const furl = `${config.BASE_URL}/api/v1/payments/payu/failure`;

    const { html, hash } = buildPaymentForm({
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      phone,
      surl,
      furl,
    });

    res.status(200).json({ html, txnid, hash });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  initPayment
};
