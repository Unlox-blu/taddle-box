'use strict';

const pool = require('../../config/database');
const { createError } = require('../../utils/error.util');
const WalletModel = require('./wallet.model');
const crypto = require('crypto');
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

  async getTransactions({ userId, limit, offset }) {
    try {
      const wallet = await this.walletRepo.findByUserId(userId);
      if (!wallet) throw createError('Wallet not found', 404);

      const { transactions, total } = await this.walletRepo.getTransactions(wallet.id, limit, offset);
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

  async initiateWithdrawal({ userId, amountCents }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const wallet = await this.walletRepo.findByUserId(userId);
      if (!wallet) throw createError('Cash wallet not found', 404);
      if (wallet.balanceCents < amountCents) throw createError('Insufficient cash balance', 400);

      const token = crypto.randomBytes(32).toString('hex');
      const handoffUrl = `https://admin.yourdomain.com/redeem?token=${token}&amount=${amountCents}`;

      const updatedWallet = await this.walletRepo.holdBalance(wallet.id, amountCents, client);
      
      const txn = await this.walletRepo.createTransaction({
        walletId: wallet.id,
        type: 'debit',
        amountCents: amountCents,
        balanceAfterCents: updatedWallet.balanceCents,
        description: `Withdrawal initiated`,
        category: 'withdrawal',
        razorpayOrderId: token,
        status: 'pending'
      }, client);

      await client.query('COMMIT');

      emitWalletUpdate(userId, updatedWallet.balanceCents);
      return { handoffUrl, token, wallet: updatedWallet, transaction: txn };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async confirmWithdrawalWebhook({ userId, amountCents, externalTxId }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const wallet = await this.walletRepo.findByUserId(userId);
      if (!wallet) throw createError('Cash wallet not found', 404);

      // We assume orderId is passed in externalTxId
      const txn = await this.walletRepo.findTransactionByRazorpayOrderId(externalTxId);
      if (!txn) throw createError('Transaction not found', 404);
      if (txn.status !== 'pending') throw createError('Transaction is not pending', 400);

      const updatedWallet = await this.walletRepo.releaseHoldBalance(wallet.id, txn.amountCents, client);

      await client.query(`UPDATE ${WalletModel.TRANSACTIONS_TABLE} SET status = 'completed', description = 'Withdrawal payout successful', updated_at = NOW() WHERE id = $1`, [txn.id]);

      await client.query('COMMIT');
      emitWalletUpdate(userId, updatedWallet.balanceCents);
      return updatedWallet;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async rejectWithdrawalWebhook({ userId, externalTxId }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const wallet = await this.walletRepo.findByUserId(userId);
      if (!wallet) throw createError('Cash wallet not found', 404);

      const txn = await this.walletRepo.findTransactionByRazorpayOrderId(externalTxId);
      if (!txn) throw createError('Transaction not found', 404);
      if (txn.status !== 'pending') throw createError('Transaction is not pending', 400);

      // Release hold
      await this.walletRepo.releaseHoldBalance(wallet.id, txn.amountCents, client);
      // Restore balance
      const updatedWallet = await this.walletRepo.creditBalance(wallet.id, txn.amountCents, client);

      await client.query(`UPDATE ${WalletModel.TRANSACTIONS_TABLE} SET status = 'failed', description = 'Withdrawal payout failed (refunded)', updated_at = NOW(), balance_after_cents = $2 WHERE id = $1`, [txn.id, updatedWallet.balanceCents]);

      await client.query('COMMIT');
      emitWalletUpdate(userId, updatedWallet.balanceCents);
      return updatedWallet;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = WalletService;
