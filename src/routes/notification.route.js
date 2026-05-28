'use strict';

// ─── src/routes/notification.route.js ───────────────────────────────────────
const router = require('express').Router();
const { notificationController } = require('../container');
const { verifyToken }            = require('../middlewares/auth.middleware');

router.get('/',            verifyToken, notificationController.getAll);
router.patch('/read-all',  verifyToken, notificationController.markAllRead);
router.patch('/:id/read',  verifyToken, notificationController.markOneRead);

module.exports = router;
