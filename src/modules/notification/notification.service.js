'use strict';

const NotificationModel = require('./notification.model');
const {
  emitNotification,
  emitWalletUpdate: _emitWallet,
} = require('../../sockets/notification.socket');

class NotificationService {
  constructor({ notificationRepository }) {
    this.notifRepo = notificationRepository;
  }
  
  async create({ recipientId, senderId, type, title, message, resourceType = null, resourceId = null }) {
    try {
      const notif = await this.notifRepo.create({
        recipientId,
        senderId,
        type,
        title,
        message,
        resourceType,
        resourceId,
      });
      
      emitNotification(recipientId, NotificationModel.format(notif));
      return notif;
    } catch (error) {
      throw error;
    }
  }

  async getAll({userId, limit, offset, unreadOnly}) {
    try {
      const { rows, total } = await this.notifRepo.findByUser(userId, limit, offset, unreadOnly);
      const unreadCount = await this.notifRepo.getUnreadCount(userId);
      return { notifications: rows.map(NotificationModel.format), total, unreadCount };
    } catch (error) {
      throw error;
    }
  }

  async markAllRead({userId}) {
    try {
      await this.notifRepo.markAllRead(userId);
    } catch (error) {
      throw error;
    }
  }

  async markOneRead({id: notificationId, userId}) {
    try {
      await this.notifRepo.markOneRead(notificationId, userId);
    } catch (error) {
      throw error;
    }
  }

  // Emits a real-time wallet balance update to a user's socket room
  async emitWalletUpdate(userId, newBalanceCents) {
    _emitWallet(userId, newBalanceCents);
  }
}

module.exports = NotificationService;
