'use strict';

const { sendPushToMany, pollReceipts } = require('../../integrations/pushNotification/providers');

class PushNotificationService {
  constructor({ pushNotificationRepository }) {
    this.pushNotificationRepo = pushNotificationRepository;
  }

  async registerToken({ userId, deviceId, pushToken, pushProvider, platform }) {
    try {
      return await this.pushNotificationRepo.create({ userId, deviceId, pushToken, pushProvider, platform });
    } catch (error) {
      throw error;
    }
  }

  async toggleNotification({ userId, deviceId }) {
    try {
      const result = await this.pushNotificationRepo.toggleNotification({ userId, deviceId });
      if (result.notificationsEnabled) return 'Notification on successfully';
      else return 'Notification off successfully';
    } catch (error) {
      throw error;
    }
  }

  async sendToUser({ userId, title, message, data = {} }) {
    try {
      const devices = await this.pushNotificationRepo.findByUser(userId);
      if (!devices.length) return [];

      const receipts = await sendPushToMany(devices, title, message, data);

      // Prune tokens that the provider rejected outright (ticket-level errors).
      const deadTokens = (receipts || [])
        .filter((r) => r?.details?.error === 'DeviceNotRegistered')
        .map((r) => r.token)
        .filter(Boolean);
      if (deadTokens.length) {
        await this.pushNotificationRepo.deleteTokens(deadTokens).catch(() => {});
      }

      return receipts;
    } catch (error) {
      throw error;
    }
  }

  async deleteTokensForUser(userId) {
    try {
      await this.pushNotificationRepo.deleteByUser(userId);
    } catch (error) {
      // Best-effort — never break logout because of token cleanup.
    }
  }

  // ── Receipt polling (call ~30–60 s after sendToUser) ─────────────────────
  async pollAndPruneReceipts(receipts) {
    try {
      const ticketIds = (receipts || [])
        .map((r) => r.ticketId)
        .filter(Boolean);
      if (!ticketIds.length) return;

      const finalReceipts = await pollReceipts(ticketIds);

      const deadTokens = [];
      for (const [ticketId, receipt] of Object.entries(finalReceipts)) {
        if (receipt.status === 'ok') continue;

        const original = (receipts || []).find((r) => r.ticketId === ticketId);
        const token = original?.token;

        if (receipt.status === 'error') {
          const err = receipt.details?.error || receipt.message || 'unknown';
          if (err === 'DeviceNotRegistered' && token) {
            deadTokens.push(token);
          }
        }
      }

      if (deadTokens.length) {
        await this.pushNotificationRepo.deleteTokens(deadTokens).catch(() => {});
      }
    } catch (error) {
      // Receipt polling is best-effort — never block the caller.
    }
  }
}

module.exports = PushNotificationService;
