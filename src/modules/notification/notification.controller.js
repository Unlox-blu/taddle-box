'use strict';

const { apiResponse } = require('../../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../../utils/pagination.util');
const { timeToCutoff } = require('../../utils/time.util');

class NotificationController {
  constructor({ notificationService }) {
    this.notifSvc = notificationService;
  }

  getAll = async (req, res, next) => {
    try {
      const userId = req.userId;
      const unreadOnly = req.query?.unread && req.query.unread  === 'true';
      // `type` accepts a comma-separated list of stored notification types
      // (e.g. "COMMENT,REPLY") so tabs can bucket related kinds together.
      const types = req.query?.type
        ? String(req.query.type)
            .split(',')
            .map((t) => t.trim().toUpperCase())
            .filter(Boolean)
        : null;
      // Server-side search term (matches title / message / sender name /
      // sender username) and the TIME window → created_at cutoff.
      const q = req.query?.q ? String(req.query.q).trim().slice(0, 200) : '';
      const timeCutoff = timeToCutoff(req.query?.time);
      // Sort mirrors global search: 'latest' (default) is newest-first,
      // 'relevance' ranks by query-match strength, 'top'/'hot' rank by
      // stacked engagement (meta.actorCount) with age decay for hot.
      const sort = req.query?.sort ? String(req.query.sort) : 'latest';
      const { limit, offset, page } = getPaginationParams(req.query);
      const { notifications, total, unreadCount, counts } = await this.notifSvc.getAll( {userId, limit, offset, unreadOnly, types, q, timeCutoff, sort} );
      // Server-computed type pills (like global search): counts per bucket
      // under the same q/time filters, so the app can render "Likes (3)".
      const typePills = [
        { type: 'all', label: 'All', count: total },
        { type: 'likes', label: 'Likes', count: counts?.likes ?? 0 },
        { type: 'comments', label: 'Comments', count: counts?.comments ?? 0 },
        { type: 'follows', label: 'Follows', count: counts?.follows ?? 0 },
      ];
      res.json(
        apiResponse(notifications, 'Notifications fetched', {
          ...paginationMeta(total, page, limit),
          unreadCount,
          types: typePills,
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
