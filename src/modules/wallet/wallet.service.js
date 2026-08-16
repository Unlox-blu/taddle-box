'use strict';

const pool = require('../../config/database');
const { createError } = require('../../utils/error.util');
const WalletModel = require('./wallet.model');
const crypto = require('crypto');
const config = require('../../config/app.config');
const { buildPaymentForm, newTxnId, verifyResponseHash } = require('../../integrations/payment/payu.service');
const { emitWalletUpdate, emitXPUpdate } = require('../../sockets/notification.socket');

class WalletService {
  constructor({ walletRepository, xpRepository }) {
    this.walletRepo = walletRepository;
    this.xpRepo = xpRepository;
  }

  async createWallet({ userId }) {
    try {
      const isExist = await this.walletRepo.findByUserId(userId);
      if (isExist) throw createError('Wallet already exist', 409);

      const wallet = await this.walletRepo.create(userId);
      return wallet;
    } catch (error) {
      throw error;
    }
  }

  async getWallet({ userId }) {
    try {
      const wallet = await this.walletRepo.findByUserId(userId);
      if (!wallet) throw createError('Wallet not found', 404);

      return wallet;
    } catch (error) {
      throw error;
    }
  }

  // Lightweight wallet summary — just the balances, no transactions/settings.
  // Used by the app's Home/streak flows where only the "count" is needed.
  async getWalletSummary({ userId }) {
    try {
      const wallet = await this.walletRepo.findByUserId(userId);
      const xpWallet = await this.xpRepo.findByUserId(userId);
      return {
        balanceCents: wallet?.balanceCents ?? 0,
        heldBalanceCents: wallet?.heldBalanceCents ?? 0,
        xpBalance: xpWallet?.Xp ?? 0,
      };
    } catch (error) {
      throw error;
    }
  }

  async getTransactions({ userId, limit, offset, q }) {
    try {
      const wallet = await this.walletRepo.findByUserId(userId);
      if (!wallet) throw createError('Wallet not found', 404);

      const { transactions, total } = await this.walletRepo.getTransactions(wallet.id, limit, offset, q);
      return { transactions, total };
    } catch (error) {
      throw error;
    }
  }

  async linkUPI({ userId, upiId }) {
    try {
      const wallet = await this.walletRepo.findByUserId(userId);
      if (!wallet) throw createError('Cash wallet not found', 404);

      const updatedWallet = await this.walletRepo.updateUPI(userId, upiId);
      return updatedWallet;
    } catch (error) {
      throw error;
    }
  }

  async convertXpToCash({ userId, xpAmount }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const xpWallet = await this.xpRepo.findByUserId(userId);
      if (!xpWallet) throw createError('XP wallet not found', 404);
      if (xpWallet.Xp < xpAmount) throw createError('Insufficient XP balance', 400);

      const wallet = await this.walletRepo.findByUserId(userId);
      if (!wallet) throw createError('Cash wallet not found', 404);

      // Hardcoded conversion rate: 100 XP = 1 Cash Unit (₹1 = 100 cents)
      // So 100 XP = 100 cents. Or simply 1 XP = 1 cent. 
      const cashAmountCents = xpAmount;

      const balanceBeforeXp = xpWallet.Xp;
      const updatedXp = await this.xpRepo.decrementXp(userId, xpAmount, client);

      await this.xpRepo.createTransaction({
        xpId: xpWallet.id,
        xp: xpAmount,
        transactionType: 'spent',
        sourceType: 'redeem',
        balanceBefore: balanceBeforeXp,
        balanceAfter: updatedXp.Xp,
        status: 'completed',
      }, client);

      const updatedWallet = await this.walletRepo.creditBalance(wallet.id, cashAmountCents, client);

      await this.walletRepo.createTransaction({
        walletId: wallet.id,
        type: 'credit',
        amountCents: cashAmountCents,
        balanceAfterCents: updatedWallet.balanceCents,
        description: 'Converted from XP',
        category: 'topup',
        status: 'completed'
      }, client);

      await client.query('COMMIT');

      emitXPUpdate(userId, updatedXp.Xp);
      emitWalletUpdate(userId, updatedWallet.balanceCents);

      return { wallet: updatedWallet, xp: updatedXp };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Recharge the cash wallet via PayU. Creates a pending topup transaction and
   * returns the auto-submitting PayU HTML form for the app's WebView.
   */
  async initiateRecharge({ userId, amountCents }) {
    const client = await pool.connect();
    try {
      if (!amountCents || amountCents < 10000) {
        // Min ₹100
        throw createError('Minimum recharge amount is ₹100', 400);
      }

      let wallet = await this.walletRepo.findByUserId(userId);
      if (!wallet) wallet = await this.walletRepo.create(userId);

      const txnid = newTxnId('TDL');

      await this.walletRepo.createTransaction({
        walletId: wallet.id,
        type: 'credit',
        amountCents,
        balanceAfterCents: wallet.balanceCents,
        description: `Wallet recharge of ₹${(amountCents / 100).toFixed(2)}`,
        category: 'topup',
        razorpayOrderId: txnid,
        status: 'pending',
      }, client);

      await client.query('COMMIT');

      const user = await pool.query(`SELECT name, email, phone_number FROM users WHERE id = $1`, [userId]);
      const firstName = user.rows[0]?.name?.split(' ')[0] || 'TaddleUser';
      const email = user.rows[0]?.email || 'user@taddlebox.com';
      const phone = user.rows[0]?.phone_number || '9999999999';

      const returnBase = config.PAYU_RETURN_BASE_URL || config.BASE_URL;
      const surl = `${returnBase}/api/v1/wallet/recharge/result?txnid=${txnid}`;
      const furl = `${returnBase}/api/v1/wallet/recharge/result?txnid=${txnid}`;

      const { html, hash } = buildPaymentForm({
        txnid,
        amount: amountCents / 100, // PayU expects rupees
        productinfo: 'Taddlebox Wallet Recharge',
        firstname: firstName,
        email,
        phone,
        surl,
        furl,
        udf1: userId,
      });

      return { html, hash, txnid, amountCents };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Called by PayU's redirect (GET) after checkout. Verifies the response hash,
   * credits the pending recharge and returns an HTML page for the WebView.
   */
  async completeRecharge({ txnid, params }) {
    const client = await pool.connect();
    try {
      const valid = verifyResponseHash({ ...params, txnid: params.txnid || txnid });
      // PayU signs failure redirects too, so the hash being valid does NOT mean
      // the payment succeeded — status must be 'success' before crediting.
      const success = valid && String(params.status).toLowerCase() === 'success';

      if (!valid) {
        return { ok: false, html: rechargeResultHtml(false, 'Payment verification failed. Please contact support.') };
      }

      const txn = await this.walletRepo.findTransactionByRazorpayOrderId(txnid);
      if (!txn) {
        return { ok: false, html: rechargeResultHtml(false, 'Transaction not found.') };
      }

      await client.query('BEGIN');

      // Row-lock the transaction so a re-delivered redirect can't double-credit.
      const locked = await client.query(
        `SELECT status FROM ${WalletModel.TRANSACTIONS_TABLE} WHERE id = $1 FOR UPDATE`,
        [txn.id]
      );
      if (locked.rows[0]?.status !== 'pending') {
        await client.query('COMMIT');
        return { ok: true, html: rechargeResultHtml(true, 'Payment already processed.') };
      }

      const wallet = await this.walletRepo.findById(txn.walletId);
      if (!wallet) throw createError('Wallet not found', 404);

      if (!success) {
        // Failed/cancelled checkout — never credit, just mark the txn failed.
        await client.query(
          `UPDATE ${WalletModel.TRANSACTIONS_TABLE} SET status = 'failed' WHERE id = $1`,
          [txn.id]
        );
        await client.query('COMMIT');
        return { ok: false, html: rechargeResultHtml(false, 'Payment failed or was cancelled.') };
      }

      const updatedWallet = await this.walletRepo.creditBalance(wallet.id, txn.amountCents, client);

      await client.query(
        `UPDATE ${WalletModel.TRANSACTIONS_TABLE}
         SET status = 'completed', balance_after_cents = $2, razorpay_payment_id = $3
         WHERE id = $1`,
        [txn.id, updatedWallet.balanceCents, params.mihpayid || params.payuMoneyId || null]
      );

      await client.query('COMMIT');

      emitWalletUpdate(wallet.userId, updatedWallet.balanceCents);
      return { ok: true, html: rechargeResultHtml(true, 'Payment successful!') };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Buy XP using cash wallet balance (e.g. to enter XP-only games/events).
   * Conversion rate comes from XP_PER_RUPEE env (default 100 XP = ₹1).
   */
  async convertCashToXp({ userId, amountCents }) {
    const client = await pool.connect();
    try {
      if (!amountCents || amountCents <= 0) throw createError('Invalid amount', 400);

      await client.query('BEGIN');

      const wallet = await this.walletRepo.findByUserId(userId);
      if (!wallet) throw createError('Cash wallet not found', 404);
      if (wallet.balanceCents < amountCents) throw createError('Insufficient cash balance', 400);

      const xpWallet = await this.xpRepo.findByUserId(userId);
      if (!xpWallet) throw createError('XP wallet not found', 404);

      const xpAmount = Math.round((amountCents / 100) * config.XP_PER_RUPEE);

      const updatedWallet = await this.walletRepo.debitBalance(wallet.id, amountCents, client);

      await this.walletRepo.createTransaction({
        walletId: wallet.id,
        type: 'debit',
        amountCents,
        balanceAfterCents: updatedWallet.balanceCents,
        description: `Purchased ${xpAmount.toLocaleString('en-IN')} XP`,
        category: 'system',
        status: 'completed',
      }, client);

      const balanceBeforeXp = xpWallet.Xp;
      const updatedXp = await this.xpRepo.incrementXp(userId, xpAmount, client);

      await this.xpRepo.createTransaction({
        xpId: xpWallet.id,
        xp: xpAmount,
        transactionType: 'earned',
        sourceType: 'cash_to_xp',
        balanceBefore: balanceBeforeXp,
        balanceAfter: updatedXp.Xp,
        status: 'completed',
      }, client);

      await client.query('COMMIT');

      emitWalletUpdate(userId, updatedWallet.balanceCents);
      emitXPUpdate(userId, updatedXp.Xp);

      return { wallet: updatedWallet, xp: updatedXp, xpAmount, rate: config.XP_PER_RUPEE };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async initiateWithdrawal({ userId, amountCents }) {
    const client = await pool.connect();
    try {
      // Minimum ₹50 — below that the payout isn't worth the rails cost.
      if (!amountCents || amountCents < 5000) {
        throw createError('Minimum withdrawal amount is ₹50', 400);
      }
      await client.query('BEGIN');
      const wallet = await this.walletRepo.findByUserId(userId);
      if (!wallet) throw createError('Cash wallet not found', 404);
      if (wallet.balanceCents < amountCents) throw createError('Insufficient cash balance', 400);
      // Payouts go to the linked UPI — refuse withdrawals without a payout rail.
      if (!wallet.linkedUpi) throw createError('Link a UPI ID before withdrawing', 400);

      const updatedWallet = await this.walletRepo.holdBalance(wallet.id, amountCents, client);
      
      const txn = await this.walletRepo.createTransaction({
        walletId: wallet.id,
        type: 'debit',
        amountCents: amountCents,
        balanceAfterCents: updatedWallet.balanceCents,
        description: `Withdrawal requested`,
        category: 'withdrawal',
        status: 'pending'
      }, client);

      await client.query('COMMIT');

      emitWalletUpdate(userId, updatedWallet.balanceCents);
      return { wallet: updatedWallet, transaction: txn };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }



}

// Minimal success/failure page rendered inside the app's WebView after PayU
// redirects back to our backend. The app detects this URL and closes the
// modal, then refetches the wallet.
const rechargeResultHtml = (ok, message) => {
  // Serialize the bridge payload once (a JSON string literal) so the script
  // below is a plain interpolation — no nested template expressions.
  const payload = JSON.stringify({
    kind: 'rechargeResult',
    ok: !!ok,
    message: String(message || ''),
  });
  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: ${ok ? '#064e3b' : '#450a0a'}; color: #fff; font-family: sans-serif; text-align: center; padding: 24px; }
        .emoji { font-size: 56px; }
        h2 { margin: 12px 0 4px; }
        p { opacity: 0.85; margin: 0; }
      </style>
    </head>
    <body>
      <div>
        <div class="emoji">${ok ? '✅' : '❌'}</div>
        <h2>${ok ? 'Payment Successful' : 'Payment Failed'}</h2>
        <p>${message} You can close this page.</p>
      </div>
      <script>
        // Tell the RN WebView the checkout outcome so the app can close the
        // modal, refresh the wallet and show a result toast. Runs on load, so
        // the message arrives exactly when the result page is visible.
        try {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(${payload});
          }
        } catch (e) {}
      </script>
    </body>
  </html>
`;
};

module.exports = WalletService;
