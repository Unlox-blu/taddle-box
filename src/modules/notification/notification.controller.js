'use strict';

const { apiResponse } = require('../../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../../utils/pagination.util');

class NotificationController {
  constructor({ notificationService }) {
    this.notifSvc = notificationService;
  }

  getAll = async (req, res, next) => {
    try {
      const userId = req.userId;
      const unreadOnly = req.query?.unread && req.query.unread  === 'true';
      const type = req.query?.type ? String(req.query.type).toUpperCase() : null;
      const { limit, offset, page } = getPaginationParams(req.query);
      const { notifications, total, unreadCount } = await this.notifSvc.getAll( {userId, limit, offset, unreadOnly, type} );
      res.json(
        apiResponse(notifications, 'Notifications fetched', {
          ...paginationMeta(total, page, limit),
          unreadCount,
        })
      );
    } catch (error) {
      next(error);
    }
  };

  getUnreadCount = async (req, res, next) => {
    try {
      const unreadCount = await this.notifSvc.getUnreadCount({ userId: req.userId });
      res.json(apiResponse({ unreadCount }, 'Unread count fetched'));
    } catch (error) {
      next(error);
    }
  };

  markAllRead = async (req, res, next) => {
    try {
      const userId = req.userId;
      await this.notifSvc.markAllRead({userId});
      res.json(apiResponse(null, 'All notifications marked as read'));
    } catch (error) {
      next(error);
    }
  };

  markOneRead = async (req, res, next) => {
    try {
      const { notificationId } = req.params;
      const userId = req.userId;
      await this.notifSvc.markOneRead({notificationId, userId});
      res.json(apiResponse(null, 'Notification marked as read'));
    } catch (error) {
      next(error);
    }
  };

  getPreferences = async (req, res, next) => {
    try {
      const preferences = await this.notifSvc.getPreferences(req.userId);
      res.json(apiResponse(preferences, 'Notification preferences fetched successfully'));
    } catch (error) {
      next(error);
    }
  };

  updatePreferences = async (req, res, next) => {
    try {
      const preferences = await this.notifSvc.updatePreferences(req.userId, req.body || {});
      res.json(apiResponse(preferences, 'Notification preferences updated successfully'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = NotificationController;
