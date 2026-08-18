'use strict';

const router = require('express').Router();
const { pushNotificationController } = require('../modules/pushNotification/pushNotification.container');
const { verifyToken } = require('../middlewares/auth.middleware');
const { validateRequest } = require('../middlewares/validator.middleware');
const { registerSchema, toggleNotificationSchema, sendSchema } = require('../modules/pushNotification/pushNotification.validator');

router.post('/register',            verifyToken,  validateRequest({ body: registerSchema }),            pushNotificationController.registerToken);
router.post('/togglenotification',  verifyToken,  validateRequest({ body: toggleNotificationSchema }),  pushNotificationController.toggleNotification);
router.post('/send',                verifyToken,  validateRequest({ body: sendSchema }),                pushNotificationController.send);

module.exports = router;
