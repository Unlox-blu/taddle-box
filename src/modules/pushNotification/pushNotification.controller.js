'use strict';

const { apiResponse } = require('../../utils/response.util');

class PushNotificationController {
  constructor({ pushNotificationService }) {
    this.pushNotificationSvc = pushNotificationService;
  }

  registerToken = async (req, res, next) => {
    try {
      const userId = req.userId;
      const {
        pushToken,
        pushProvider = 'expo',
        deviceId,
        token,
        platform,
      } = req.body;

      const resolvedToken = pushToken || token;
      const resolvedProvider = pushProvider;
      const resolvedPlatform = platform;
      const resolvedDeviceId = deviceId || `legacy-${userId}-${resolvedPlatform || 'unknown'}`;

      const registered = await this.pushNotificationSvc.registerToken({
        userId,
        deviceId: resolvedDeviceId,
        pushToken: resolvedToken,
        pushProvider: resolvedProvider,
        platform: resolvedPlatform,
      });

      res.status(201).json(apiResponse(registered, 'Device token registered'));
    } catch (error) {
      next(error);
    }
  };

  toggleNotification = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { deviceId, token } = req.body;
      const resolvedDeviceId = deviceId || `legacy-${userId}-unknown`;
      const message = await this.pushNotificationSvc.toggleNotification({ userId, deviceId: resolvedDeviceId });
      res.status(201).json(apiResponse(null, message));
    } catch (error) {
      next(error);
    }
  };

  send = async (req, res, next) => {
    try {
      const { userId, title, message, data } = req.body;
      const receipts = await this.pushNotificationSvc.sendToUser({ userId, title, message, data });
      res.json(apiResponse(receipts, 'Push notification sent'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = PushNotificationController;
