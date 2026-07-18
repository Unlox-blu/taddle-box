'use strict';

const NotificationRedisService = require('./notification.redis');

const notificationRedisService = new NotificationRedisService();

const isUserOnline = (userId) => notificationRedisService.isUserOnline(userId);
const setUserOnline = (userId, ttlSeconds = 300) => notificationRedisService.setUserOnline(userId, ttlSeconds);
const setUserOffline = (userId) => notificationRedisService.setUserOffline(userId);

module.exports = {
  isUserOnline,
  setUserOnline,
  setUserOffline,
};
