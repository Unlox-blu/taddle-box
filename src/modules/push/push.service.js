'use strict';

const { sendPush } = require('../../integrations/push/expo');

// Expo push tokens always start with these prefixes; anything else is garbage
// (e.g. an FCM token sent by mistake) and would fail delivery for everyone.
const isValidExpoToken = (token) =>
  typeof token === 'string' &&
  (/^ExponentPushToken\[.+\]$/.test(token) || /^ExpoPushToken\[.+\]$/.test(token));

class PushService {
  constructor({ pushRepository }) {
    this.pushRepo = pushRepository;
  }

  async registerToken({ userId, token, platform }) {
    try {
      if (!isValidExpoToken(token)) {
        throw new Error('Invalid Expo push token');
      }
      return await this.pushRepo.create({ userId, token, platform });
    } catch (error) {
      throw error;
    }
  }

  async toggleNotification({ userId, token }) {
    try {
        const result = await this.pushRepo.toggleNotification({ userId, token}); 

        if(result.notificationsEnabled)
            return 'Notification on successfully'
        else
            return 'Notification of successfully'
    } catch (error) {
        throw error
    }
  }

  async sendToUser({ recipientId, type, message, data = {} }) {
    try {
      const tokens = await this.pushRepo.findByUser(recipientId);
      const tokenList = tokens.map((t) => t.token);
      if (!tokenList.length) return [];
<<<<<<< HEAD
      return await sendPush(tokenList, type, message, data);
=======

      const receipts = await sendPush(tokenList, title, message, data);

      // Prune dead tokens so future deliveries don't keep failing.
      const deadTokens = (receipts || [])
        .filter((r) => r?.details?.error === 'DeviceNotRegistered')
        .map((r) => r.token)
        .filter(Boolean);
      if (deadTokens.length) {
        await this.pushRepo.deleteTokens(deadTokens).catch(() => {});
      }

      return receipts;
>>>>>>> 5b2004b6cdc754160b22e5fe51fcab9b80dbb0b2
    } catch (error) {
      throw error;
    }
  }
}

module.exports = PushService;
