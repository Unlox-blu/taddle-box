'use strict';

const NotificationModel = require('../models/notification.model');
const { emitNotification, emitWalletUpdate: _emitWallet } = require('../sockets/notification.socket');

class NotificationService {
  constructor({ notificationRepository }) {
    this.notifRepo = notificationRepository;
  }

  // Creates a DB record + emits real-time socket event
  async create({ recipientId, senderId, type, title, message, resourceType, resourceId }) {
    const notif = await this.notifRepo.create({
      recipientId, senderId, type, title, message, resourceType, resourceId,
    });
    // Emit immediately — non-blocking
    emitNotification(recipientId, NotificationModel.format(notif));
    return notif;
  }

  async getAll(userId, limit, offset, unreadOnly = false) {
    const { rows, total } = await this.notifRepo.findByUser(userId, limit, offset, unreadOnly);
    const unreadCount = await this.notifRepo.getUnreadCount(userId);
    return { notifications: rows.map(NotificationModel.format), total, unreadCount };
  }

  async markAllRead(userId) {
    await this.notifRepo.markAllRead(userId);
  }

  async markOneRead(notificationId, userId) {
    await this.notifRepo.markOneRead(notificationId, userId);
  }

  // Emits a real-time wallet balance update to a user's socket room
  async emitWalletUpdate(userId, newBalanceCents) {
    _emitWallet(userId, newBalanceCents);
  }
}

module.exports = NotificationService;
