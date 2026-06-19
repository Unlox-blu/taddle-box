'use strict';

const { apiResponse } = require('../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../utils/pagination.util');

class NotificationController {
  constructor({ notificationService }) {
    this.notifSvc = notificationService;
  }

  getAll = async (req, res, next) => {
    try {
      const userId = req.userId;
      const unreadOnly = req.query?.unread && req.query.unread  === 'true';
      const { limit, offset, page } = getPaginationParams(req.query);
      const { notifications, total, unreadCount } = await this.notifSvc.getAll( {userId, limit, offset, unreadOnly} );
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
      const { id } = req.params;
      const userId = req.userId;
      await this.notifSvc.markOneRead({id, userId});
      res.json(apiResponse(null, 'Notification marked as read'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = NotificationController;
