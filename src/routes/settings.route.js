'use strict';

// ─── src/routes/user.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { settingsController }         = require('../modules/settings/settings.container');
const { notificationController } = require('../modules/notification/notification.container');
const { verifyToken } = require('../middlewares/auth.middleware');
const { validateRequest }               = require('../middlewares/validator.middleware');
const { setAppLockSchema, setThemeSchema } = require('../modules/settings/settings.validator');


router.post('/',                        verifyToken,                                   settingsController.createSettings)
router.get('/',                         verifyToken,                                   settingsController.getSettings)
router.patch('/theme',                  verifyToken,   validateRequest({ body: setThemeSchema }),       settingsController.setTheme)
router.patch('/systemnotification',     verifyToken,                                   settingsController.toggleSystemNotification)
router.patch('/promotionalnotification',verifyToken,                                   settingsController.togglePromotionalNotification)
router.patch('/notifxp',                verifyToken,                                   settingsController.toggleNotifXP)
router.patch('/notifwithdraw',          verifyToken,                                   settingsController.toggleNotifWithdraw)
router.patch('/notifpromos',            verifyToken,                                   settingsController.toggleNotifPromos)
router.patch('/publicaccount',          verifyToken,                                   settingsController.togglePublicAccount)
router.patch('/activitystatus',         verifyToken,                                   settingsController.toggleActivityStatus)
router.patch('/allowtagging',           verifyToken,                                   settingsController.toggleAllowTagging)
router.patch('/showonleaderboard',      verifyToken,                                   settingsController.toggleShowOnLeaderboard)
router.get('/notifications/preferences', verifyToken,                                  notificationController.getPreferences)
router.put('/notifications/preferences', verifyToken,                                  notificationController.updatePreferences)

module.exports = router