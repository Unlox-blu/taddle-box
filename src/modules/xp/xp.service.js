'use strict';

const { createError } = require('../../utils/error.util');
const { emitXPUpdate } = require('../../sockets/notification.socket');

class XpService {
  constructor({ xpRepository }) {
    this.xpRepo = xpRepository;
  }

  async createXPwallet({ userId }) {
    try {
      const isExist = await this.xpRepo.findByUserId(userId);
      if (isExist) throw createError('xp wallet already Exist', 409);

      const XPwallet = await this.xpRepo.create(userId);
      return XPwallet;
    } catch (error) {
      throw error;
    }
  }

  async getXP({ userId }) {
    try {
      const xp = await this.xpRepo.findByUserId(userId);
      if (!xp) throw createError('xp wallet not found', 404);

      return xp;
    } catch (error) {
      throw error;
    }
  }

  async getTransactions({ userId, limit, offset }) {
    try {
      let xpWallet = await this.xpRepo.findByUserId(userId);
      if (!xpWallet) {
        xpWallet = await this.xpRepo.create(userId);
      }
      const { rows, total } = await this.xpRepo.getUserTransactions(xpWallet.id, limit, offset);
      return { transactions: rows, total };
    } catch (error) {
      throw error;
    }
  }

  async creditXP({ userId, xp, transactionType, sourceType }) {
    try {
      let xpWallet = await this.xpRepo.findByUserId(userId);
      if (!xpWallet) {
        xpWallet = await this.xpRepo.create(userId);
      }

      // Prevent duplicate daily login
      if (sourceType === 'Daily Login') {
        const recent = await this.xpRepo.checkDailyTransactionBySource(xpWallet.id, sourceType);
        if (recent) {
          return { alreadyClaimed: true, message: 'Daily Login already claimed today' };
        }
      }

      // Prevent duplicate post views
      if (sourceType && sourceType.startsWith('view_post_')) {
        const existing = await this.xpRepo.getTransactionsBySource(xpWallet.id, sourceType);
        if (existing && existing.length > 0) {
          return { alreadyClaimed: true, message: 'XP already claimed for this post view' };
        }
      }

      const balanceBefore = xpWallet.Xp;

      const updatedXP = await this.xpRepo.incrementXp(userId, xp);

      const xpTransaction = await this.xpRepo.createTransaction({
        xpId: xpWallet.id,
        xp,
        transactionType,
        sourceType,
        balanceBefore,
        balanceAfter: updatedXP.Xp,
        status: 'completed',
      });

      emitXPUpdate(userId, updatedXP.Xp);

      return xpTransaction;
    } catch (error) {
      throw error;
    }
  }

  async debitXP({ userId, xp, transactionType, sourceType }) {
    try {
      const xpWallet = await this.xpRepo.findByUserId(userId);

      if (!xpWallet) {
        throw createError('XP wallet not found', 404);
      }

      if (xpWallet.Xp < xp) {
        throw createError('Insufficient XP balance', 400);
      }

      const balanceBefore = xpWallet.Xp;

      const updatedXP = await this.xpRepo.decrementXp(userId, xp);

      const xpTransaction = await this.xpRepo.createTransaction({
        xpId: xpWallet.id,
        xp,
        transactionType,
        sourceType,
        balanceBefore,
        balanceAfter: updatedXP.Xp,
        status: 'completed',
      });

      emitXPUpdate(userId, updatedXP.Xp);

      return xpTransaction;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = XpService;
