'use strict';

const { sendPush } = require('../../integrations/push/expo');

class PushService {
  constructor({ pushRepository }) {
    this.pushRepo = pushRepository;
  }

  async registerToken({ userId, token, platform }) {
    try {
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
      return await sendPush(tokenList, type, message, data);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = PushService;
