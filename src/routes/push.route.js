'use strict';

const router = require('express').Router();
const { pushController } = require('../modules/push/push.container');
const { verifyToken } = require('../middlewares/auth.middleware');
const { validateRequest } = require('../middlewares/validator.middleware');
const { registerSchema, toggleNotificationSchema, sendSchema } = require('../modules/push/push.validator');

router.post('/register',            verifyToken,  validateRequest({ body: registerSchema }),            pushController.registerToken);
router.post('/togglenotification',  verifyToken,  validateRequest({ body: toggleNotificationSchema }),  pushController.toggleNotification);
router.post('/send',                verifyToken,  validateRequest({ body: sendSchema }),                pushController.send);

module.exports = router;
