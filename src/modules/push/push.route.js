'use strict';

const router = require('express').Router();
const { pushController } = require('./push.container');
const { verifyToken } = require('../../middlewares/auth.middleware');

router.post('/register',            verifyToken,    pushController.registerToken);
router.post('/togglenotification',  verifyToken,    pushController.toggleNotification);
router.post('/send',                verifyToken,    pushController.send);

module.exports = router;
