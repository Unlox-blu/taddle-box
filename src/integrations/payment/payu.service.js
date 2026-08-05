'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config/app.config');

const PAYU_KEY = config.PAYU_KEY;
const PAYU_SALT = config.PAYU_SALT;
const PAYU_URL = config.PAYU_URL;

/**
 * Build the SHA-512 hash PayU requires to authorize a transaction.
 * Field order (request side):
 *   key|txnid|amount|productinfo|firstname|email|udf1..udf5||||||salt
 */
const generateHash = ({
  txnid,
  amount,
  productinfo,
  firstname,
  email,
  udf1 = '',
  udf2 = '',
  udf3 = '',
  udf4 = '',
  udf5 = '',
}) => {
  const hashString = `${PAYU_KEY}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${PAYU_SALT}`;
  return crypto.createHash('sha512').update(hashString).digest('hex');
};

/**
 * Verify the hash PayU returns on the success/failure redirect.
 * Field order (response side):
 *   salt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
 */
const verifyResponseHash = (params = {}) => {
  const status = params.status || '';
  const hashString = `${PAYU_SALT}|${status}||||||${params.udf5 || ''}|${params.udf4 || ''}|${params.udf3 || ''}|${params.udf2 || ''}|${params.udf1 || ''}|${params.email || ''}|${params.firstname || ''}|${params.productinfo || ''}|${params.amount || ''}|${params.txnid || ''}|${params.key || PAYU_KEY}`;
  const expected = crypto.createHash('sha512').update(hashString).digest('hex');
  return expected === (params.hash || '');
};

/**
 * Generate a fresh transaction id (max 25 chars for PayU).
 */
const newTxnId = (prefix = 'TDL') => {
  const id = uuidv4().replace(/-/g, '').toUpperCase();
  return `${prefix}${id}`.slice(0, 25);
};

/**
 * Build the auto-submitting PayU HTML form. The app renders this inside a
 * WebView; the form POSTs itself to PayU on load.
 */
const buildPaymentForm = ({ txnid, amount, productinfo, firstname, email, phone, surl, furl, udf1 = '', udf2 = '', udf3 = '', udf4 = '', udf5 = '' }) => {
  const hash = generateHash({ txnid, amount, productinfo, firstname, email, udf1, udf2, udf3, udf4, udf5 });
  return {
    hash,
    html: `
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
            <input type="hidden" name="udf1" value="${udf1}" />
            <input type="hidden" name="udf2" value="${udf2}" />
            <input type="hidden" name="udf3" value="${udf3}" />
            <input type="hidden" name="udf4" value="${udf4}" />
            <input type="hidden" name="udf5" value="${udf5}" />
            <input type="hidden" name="hash" value="${hash}" />
          </form>
        </body>
      </html>
    `,
  };
};

module.exports = {
  generateHash,
  verifyResponseHash,
  newTxnId,
  buildPaymentForm,
  PAYU_KEY,
  PAYU_URL,
};
