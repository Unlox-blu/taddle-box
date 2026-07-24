'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// Using PayU Test Credentials
const PAYU_KEY = 'gtKFFx';
const PAYU_SALT = 'eCwWELxi';
const PAYU_URL = 'https://test.payu.in/_payment';

const initPayment = async (req, res, next) => {
  try {
    const { eventId, amount } = req.body;
    const userId = req.userId || 'unknown';
    
    // In a real app, you'd fetch the user's name/email from the DB
    const firstname = 'TestUser';
    const email = 'test@example.com';
    const phone = '9999999999';
    const productinfo = `Event Registration: ${eventId}`;
    const txnid = uuidv4().substring(0, 20); // max 25 chars for PayU
    const surl = 'https://taddle.app/payu/success';
    const furl = 'https://taddle.app/payu/failure';

    // Generate Hash: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt
    const hashString = `${PAYU_KEY}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|||||||||||${PAYU_SALT}`;
    const hash = crypto.createHash('sha512').update(hashString).digest('hex');

    // Build the auto-submitting HTML form
    const htmlContent = `
      <html>
        <head>
          <title>Processing Payment...</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { display: flex; justify-content: center; align-items: center; height: 100vh; background: #0f172a; color: #fff; font-family: sans-serif; }
            .loader { border: 4px solid #334155; border-top: 4px solid #8b5cf6; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom: 16px; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            .container { text-align: center; }
          </style>
        </head>
        <body onload="document.getElementById('payuForm').submit();">
          <div class="container">
            <div class="loader"></div>
            <h3>Redirecting to Secure Payment...</h3>
          </div>
          <form action="${PAYU_URL}" id="payuForm" method="post" style="display: none;">
            <input type="hidden" name="key" value="${PAYU_KEY}" />
            <input type="hidden" name="txnid" value="${txnid}" />
            <input type="hidden" name="amount" value="${amount}" />
            <input type="hidden" name="productinfo" value="${productinfo}" />
            <input type="hidden" name="firstname" value="${firstname}" />
            <input type="hidden" name="email" value="${email}" />
            <input type="hidden" name="phone" value="${phone}" />
            <input type="hidden" name="surl" value="${surl}" />
            <input type="hidden" name="furl" value="${furl}" />
            <input type="hidden" name="hash" value="${hash}" />
          </form>
        </body>
      </html>
    `;

    res.status(200).json({ html: htmlContent, txnid });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  initPayment
};
