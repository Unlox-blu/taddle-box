'use strict';

const { createError } = require('../../utils/error.util');
const { emitXPUpdate } = require('../../sockets/account.socket');

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

  async getTransactions({ userId, limit, offset, q, timeCutoff, sort }) {
    try {
      let xpWallet = await this.xpRepo.findByUserId(userId);
      if (!xpWallet) {
        xpWallet = await this.xpRepo.create(userId);
      }
      const { rows, total } = await this.xpRepo.getUserTransactions(
        xpWallet.id,
        limit,
        offset,
        q,
        timeCutoff || null,
        sort || 'latest'
      );
      return { transactions: rows, total };
    } catch (error) {
      throw error;
    }
  }

  // Lightweight check so the Home tab doesn't have to fetch the whole
  // transaction history just to know whether today's login reward is claimed.
  // The client sends its local date so the check is timezone-safe (the credit
  // call uses the same `Daily Login - YYYY-MM-DD` source string).
  async getDailyLoginStatus({ userId, date }) {
    try {
      let xpWallet = await this.xpRepo.findByUserId(userId);
      if (!xpWallet) {
        xpWallet = await this.xpRepo.create(userId);
      }
      const sourceType = date ? `Daily Login - ${date}` : null;
      const claimed = sourceType
        ? await this.xpRepo.checkDailyTransactionBySource(xpWallet.id, sourceType)
        : false;
      return { claimed, date: date || null };
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
      if (sourceType?.startsWith('Daily Login')) {
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
      const totalEarnedBefore = xpWallet.totalXpEarned || 0;

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

      emitXPUpdate(userId, { xp: updatedXP.Xp, totalXpEarned: updatedXP.totalXpEarned });

      // Level Up Logic
      const levelBefore = Math.floor(totalEarnedBefore / 1000) + 1;
      const levelAfter = Math.floor(updatedXP.totalXpEarned / 1000) + 1;

      if (levelAfter > levelBefore && transactionType !== 'bonus') {
        const bonusAmount = levelAfter * 100;
        
        // Emit Notification
        const { notificationService } = require('../notification/notification.container');
        if (notificationService && typeof notificationService.create === 'function') {
          notificationService.create({
            recipientId: userId,
            type: 'level_up',
            title: `Level Up! 🎉`,
            message: `Congratulations! You've reached Level ${levelAfter} and earned ${bonusAmount} bonus XP.`,
          }).catch(err => console.error("Failed to emit level up notification", err));
        }

        // Credit Bonus XP
        this.creditXP({
          userId,
          xp: bonusAmount,
          transactionType: 'bonus',
          sourceType: `level_up_${levelAfter}`
        }).catch(err => console.error("Failed to credit level up bonus", err));
      }

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

      emitXPUpdate(userId, { xp: updatedXP.Xp, totalXpEarned: updatedXP.totalXpEarned });

      return xpTransaction;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = XpService;
