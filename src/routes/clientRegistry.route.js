'use strict';

const router = require('express').Router();
const { clientRegistryController } = require('../modules/pushNotification/clientRegistry.container');
const { verifyToken } = require('../middlewares/auth.middleware');
const { verifyDeviceOwnership } = require('../middlewares/deviceOwnership.middleware');
const { validateRequest } = require('../middlewares/validator.middleware');
const {
  registerSchema,
  toggleNotificationSchema,
  sendSchema,
  updateDevicePushTokenSchema,
} = require('../modules/pushNotification/clientRegistry.validator');

// Register/refresh a device token
router.post('/register',
  verifyToken,
  validateRequest({ body: registerSchema }),
  clientRegistryController.registerToken
);

// Toggle push notifications for a device/user pair
router.post('/togglenotification',
  verifyToken,
  validateRequest({ body: toggleNotificationSchema }),
  clientRegistryController.toggleNotification
);

// Send a push notification (admin/internal use)
router.post('/send',
  verifyToken,
  validateRequest({ body: sendSchema }),
  clientRegistryController.send
);

// Device-wide push token update — middleware verifies the authenticated
// user owns a registration row for the supplied deviceId before the
// handler runs.
router.post('/update-token',
  verifyToken,
  validateRequest({ body: updateDevicePushTokenSchema }),
  verifyDeviceOwnership(),
  clientRegistryController.updateDevicePushToken
);

module.exports = router;
