'use strict';

const { createError } = require('../../utils/error.util');
const { emitXPUpdate } = require('../../sockets/account.socket');
const { CLAIM_EVENTS } = require('./xp.claim');
const { XP_REWARDS } = require('./xp.rewards');

class XpService {
  constructor({ xpRepository, postRepository }) {
    this.xpRepo = xpRepository;
    // Optional — only needed to resolve view-post rewards from the post row.
    this.postRepo = postRepository || null;
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

  // Daily-login claim status for the app's Home card. The day key is
  // derived from the SERVER's clock (same derivation as the daily_login
  // claim event), so the client can never probe arbitrary dates.
  async getDailyLoginStatus({ userId }) {
    try {
      let xpWallet = await this.xpRepo.findByUserId(userId);
      if (!xpWallet) {
        xpWallet = await this.xpRepo.create(userId);
      }
      const today = new Date();
      const dayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const sourceType = `Daily Login - ${dayKey}`;
      const claimed = await this.xpRepo.checkDailyTransactionBySource(xpWallet.id, sourceType);
      return { claimed, date: dayKey, rewardXp: XP_REWARDS.dailyLogin };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Claim a platform reward by EVENT NAME. The client sends only the event
   * (e.g. 'daily_login', 'post_view') plus the minimal identifying payload
   * (e.g. { postId }). The amount, sourceType, transaction type, and all
   * verification live in the CLAIM_EVENTS registry — the request body is
   * never trusted for any of it.
   */
  async claimReward({ userId, event, payload }) {
    try {
      const handler = CLAIM_EVENTS[event];
      if (!handler) throw createError(`Unknown XP claim event: ${event}`, 400);

      const resolved = await handler({
        userId,
        payload: payload || {},
        xpRepo: this.xpRepo,
        postRepo: this.postRepo,
        xpService: this,
      });

      // Idempotent claim: a handler may return null to signal "already
      // claimed" without erroring the client.
      if (!resolved) return { alreadyClaimed: true };

      return await this.creditXP({
        userId,
        xp: resolved.xp,
        transactionType: resolved.transactionType,
        sourceType: resolved.sourceType,
      });
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