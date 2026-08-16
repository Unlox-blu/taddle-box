'use strict';

// ─── src/routes/notification.route.js ───────────────────────────────────────
const router = require('express').Router();
const { notificationController } = require('../modules/notification/notification.container');
const { verifyToken }            = require('../middlewares/auth.middleware');
const { validateRequest } = require('../middlewares/validator.middleware');
const { paginationQuerySchema, notificationIdParamsSchema } = require('../modules/notification/notification.validator');

router.get('/',                        verifyToken, validateRequest({query: paginationQuerySchema}),        notificationController.getAll);
router.get('/unread-count',            verifyToken,                                                         notificationController.getUnreadCount);
router.patch('/read-all',              verifyToken,                                                         notificationController.markAllRead);
router.patch('/:notificationId/read',  verifyToken, validateRequest({params: notificationIdParamsSchema}),  notificationController.markOneRead);

module.exports = router;
