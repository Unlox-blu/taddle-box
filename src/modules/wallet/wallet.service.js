'use strict';

const pool = require('../../config/database');
const { createError } = require('../../utils/error.util');
const WalletModel = require('./wallet.model');
const crypto = require('crypto');

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
        transactionType: 'debit',
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
      return { wallet: updatedWallet, xp: updatedXp };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async initiateWithdrawal({ userId, amountCents }) {
    try {
      const wallet = await this.walletRepo.findByUserId(userId);
      if (!wallet) throw createError('Cash wallet not found', 404);
      if (wallet.balanceCents < amountCents) throw createError('Insufficient cash balance', 400);

      // Generate secure redemption token
      const token = crypto.randomBytes(32).toString('hex');

      // The external backend URL
      const handoffUrl = `https://admin.yourdomain.com/redeem?token=${token}&amount=${amountCents}`;

      return { handoffUrl, token };
    } catch (error) {
      throw error;
    }
  }

  async confirmWithdrawalWebhook({ userId, amountCents, externalTxId }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const wallet = await this.walletRepo.findByUserId(userId);
      if (!wallet) throw createError('Cash wallet not found', 404);
      if (wallet.balanceCents < amountCents) throw createError('Insufficient cash balance', 400);

      const updatedWallet = await this.walletRepo.debitBalance(wallet.id, amountCents, client);

      await this.walletRepo.createTransaction({
        walletId: wallet.id,
        type: 'debit',
        amountCents: amountCents,
        balanceAfterCents: updatedWallet.balanceCents,
        description: `Withdrawal payout ${externalTxId}`,
        category: 'withdrawal',
        status: 'completed'
      }, client);

      await client.query('COMMIT');
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
