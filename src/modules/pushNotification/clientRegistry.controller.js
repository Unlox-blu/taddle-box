'use strict';

const { apiResponse } = require('../../utils/response.util');

class ClientRegistryController {
  constructor({ clientRegistryService }) {
    this.svc = clientRegistryService;
  }

  /**
   * POST /push-notification/register
   *
   * Registers or refreshes a device token.  Creates/updates the
   * (device_id, user_id) row in client_registry.
   *
   * The client must send:
   *   - deviceId:   stable UUID generated at install time
   *   - sessionId:  UUID generated on app startup (rotates on cold start)
   *   - pushToken:  Expo/FCM/APNs push token
   *   - platform:   'ios' | 'android' | 'web'
   */
  registerToken = async (req, res, next) => {
    try {
      const userId = req.userId;
      const {
        pushToken,
        pushProvider = 'expo',
        deviceId,
        sessionId,
        token,
        platform,
        appVersion,
        osVersion,
      } = req.body;

      const resolvedToken = pushToken || token;
      const resolvedDeviceId = deviceId || `legacy-${userId}-${platform || 'unknown'}`;
      const resolvedSessionId = sessionId || `legacy-${userId}-${resolvedDeviceId}`;
      const resolvedProvider = pushProvider;

      const registered = await this.svc.registerToken({
        userId,
        deviceId: resolvedDeviceId,
        sessionId: resolvedSessionId,
        pushToken: resolvedToken,
        pushProvider: resolvedProvider,
        platform,
        appVersion,
        osVersion,
      });

      res.status(201).json(apiResponse(registered, 'Device token registered'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /push-notification/togglenotification
   *
   * Toggles push notifications for a specific device/user pair.
   */
  toggleNotification = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { deviceId } = req.body;
      const resolvedDeviceId = deviceId || `legacy-${userId}-unknown`;
      const message = await this.svc.toggleNotification({ userId, deviceId: resolvedDeviceId });
      res.status(201).json(apiResponse(null, message));
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /push-notification/send
   *
   * Sends a push notification to a user (admin/internal use).
   */
  send = async (req, res, next) => {
    try {
      const { userId, title, message, data } = req.body;
      const receipts = await this.svc.sendToUser({ userId, title, message, data });
      res.json(apiResponse(receipts, 'Push notification sent'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /push-notification/update-token
   *
   * Device-wide push token update.
   *
   * Ownership is verified upstream by verifyDeviceOwnership middleware —
   * by the time this handler runs, the authenticated user is confirmed
   * to have an active registration row for the supplied device_id.
   *
   * The update touches ALL rows sharing the device_id (device-wide,
   * shared across accounts) but preserves each user's
   * notifications_enabled preference.
   */
  updateDevicePushToken = async (req, res, next) => {
    try {
      const { deviceId, pushToken, pushProvider } = req.body;

      const result = await this.svc.updateDevicePushToken({
        deviceId,
        pushToken,
        pushProvider,
      });

      res.json(apiResponse({ updatedRows: result.updatedRows }, 'Device push token updated'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = ClientRegistryController;
