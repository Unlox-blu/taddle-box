'use strict';

const { createError } = require('../utils/error.util');
const { clientRegistryRepository } = require('../modules/pushNotification/clientRegistry.container');

/**
 * Middleware factory: verifies the authenticated user owns a registration
 * row for the device_id in the request.
 *
 * Security rationale:
 *   Device-level operations (token refresh, toggle) intentionally cross
 *   user_id boundaries — the push token is device-wide.  But we cannot
 *   trust a bare `device_id` claim from the client.  This middleware
 *   proves ownership by checking that the JWT-authenticated user has an
 *   active row in client_registry for the supplied device_id.
 *
 * Usage:
 *   router.post('/some-device-endpoint',
 *     verifyToken,
 *     verifyDeviceOwnership(),          // reads deviceId from req.body
 *     controller.handler
 *   );
 *
 *   // Or read from params instead:
 *   router.post('/device/:deviceId/token',
 *     verifyToken,
 *     verifyDeviceOwnership({ source: 'params' }),
 *     controller.handler
 *   );
 *
 * On success, attaches the registration row to `req.deviceRegistration`.
 *
 * @param {object}  options
 * @param {'body'|'params'|'query'} options.source  Where to read deviceId (default: 'body')
 * @param {string}  options.fieldName               Key to read (default: 'deviceId')
 */
const verifyDeviceOwnership = (options = {}) => {
  const { source = 'body', fieldName = 'deviceId' } = options;

  return async (req, _res, next) => {
    try {
      const userId = req.userId;
      if (!userId) {
        throw createError('Authentication required', 401);
      }

      const deviceId = req[source]?.[fieldName];
      if (!deviceId) {
        throw createError(`${fieldName} is required in ${source}`, 400);
      }

      const registration = await clientRegistryRepository.findByDeviceAndUser({
        deviceId,
        userId,
      });

      if (!registration) {
        throw createError('Device not registered to this user', 403);
      }

      // Attach for downstream handlers (e.g. controller can skip re-querying)
      req.deviceRegistration = registration;
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = { verifyDeviceOwnership };
