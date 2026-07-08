'use strict';

// ─── src/routes/user.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { settingsController }         = require('../modules/settings/settings.container');
const { verifyToken } = require('../middlewares/auth.middleware');
const { validateRequest }               = require('../middlewares/validator.middleware');
const { setAppLockSchema, setThemeSchema } = require('../modules/settings/settings.validator');


router.post('/',                        verifyToken,                                   settingsController.createSettings)
router.get('/',                         verifyToken,                                   settingsController.getSettings)
router.patch('/theme',                  verifyToken,   validateRequest({ body: setThemeSchema }),       settingsController.setTheme)
router.patch('/systemnotification',     verifyToken,                                   settingsController.toggleSystemNotification)
router.patch('/promotionalnotification',verifyToken,                                   settingsController.togglePromotionalNotification)
router.patch('/setapplock',             verifyToken,   validateRequest({ body: setAppLockSchema }),     settingsController.setAppLock)
router.patch('/removeapplock',          verifyToken,                                   settingsController.removeAppLock)

module.exports = router