'use strict';

const pool = require('../config/database');
const { createError } = require('../utils/error.util');
const WalletModel = require('../models/wallet.model');

class WalletService {
  constructor({ walletRepository, paymentIntegration, notificationService }) {
    this.walletRepo = walletRepository;
    this.paymentSvc = paymentIntegration;
    this.notifSvc = notificationService;
  }

  async getWallet(userId) {
    try {
      const wallet = await this.walletRepo.findByUserId(userId);
      if (!wallet) throw createError('Wallet not found', 404);
      return WalletModel.formatWallet(wallet);
    } catch (error) {
      throw error;
    }
  }

  async getTransactions(userId, limit, offset) {
    try {
      const wallet = await this.walletRepo.findByUserId(userId);
      if (!wallet) throw createError('Wallet not found', 404);
      const { rows, total } = await this.walletRepo.getTransactions(wallet.id, limit, offset);
      return { transactions: rows.map(WalletModel.formatTransaction), total };
    } catch (error) {
      throw error;
    }
  }

  // Creates a Razorpay order for wallet topup.
  async createTopup(userId, amountCents) {
    try {
      const wallet = await this.walletRepo.findByUserId(userId);
      if (!wallet) throw createError('Wallet not found', 404);
      if (!wallet.is_active) throw createError('Wallet is inactive', 400);
      if (amountCents < 100) throw createError('Minimum topup is ₹1', 400);

      const receipt = `wallet_${userId}_${Date.now()}`.slice(0, 40);
      // const order = await this.paymentSvc.createOrder(amountCents, 'INR', receipt, { userId });

      return {
        // orderId: order.id,
        // amount: order.amount,
        // currency: order.currency,
        // keyId: process.env.RAZORPAY_KEY_ID,
        receipt: receipt,
      };
    } catch (error) {
      throw error;
    }
  }

  // Credits wallet after Razorpay payment verified (called from webhook handler).
  // Runs inside a DB transaction with SELECT FOR UPDATE.
  async creditAfterPayment(userId, amountCents, razorpayOrderId, razorpayPaymentId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const wallet = await this.walletRepo.lockForUpdate(
        (await this.walletRepo.findByUserId(userId)).id,
        client
      );
      if (!wallet) throw createError('Wallet not found', 404);

      const { balance_cents: newBalance } = await this.walletRepo.creditBalance(
        wallet.id,
        amountCents,
        client
      );

      await this.walletRepo.createTransaction(
        {
          walletId: wallet.id,
          type: 'credit',
          amountCents,
          balanceAfterCents: newBalance,
          description: 'Wallet topup via Razorpay',
          category: 'topup',
          razorpayOrderId,
          razorpayPaymentId,
          status: 'completed',
        },
        client
      );

      await client.query('COMMIT');

      // Real-time socket update
      this.notifSvc.emitWalletUpdate(userId, newBalance).catch(() => {});

      return newBalance;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Debits wallet (e.g. event ticket purchase).
  // Runs inside a DB transaction with SELECT FOR UPDATE.
  async debit(userId, amountCents, description, category = 'event_ticket') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const walletRow = await this.walletRepo.findByUserId(userId);
      if (!walletRow) throw createError('Wallet not found', 404);
      if (!walletRow.is_active) throw createError('Wallet is inactive', 400);

      const wallet = await this.walletRepo.lockForUpdate(walletRow.id, client);
      const { balance_cents: newBalance } = await this.walletRepo.debitBalance(
        wallet.id,
        amountCents,
        client
      );

      await this.walletRepo.createTransaction(
        {
          walletId: wallet.id,
          type: 'debit',
          amountCents,
          balanceAfterCents: newBalance,
          description,
          category,
          status: 'completed',
        },
        client
      );

      await client.query('COMMIT');
      return newBalance;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = WalletService;
