'use strict';

// ─── src/routes/user.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { settingsController }         = require('../container');
const { verifyToken } = require('../middlewares/auth.middleware');
const { validate }               = require('../middlewares/validator.middleware');
const { setAppLockSchema, setThemeSchema } = require('../validators/settings.validator');


router.post('/',                        verifyToken,                                   settingsController.createSettings)
router.get('/',                         verifyToken,                                   settingsController.getSettings)
router.patch('/theme',                  verifyToken,   validate(setThemeSchema),       settingsController.setTheme)
router.patch('/systemnotification',     verifyToken,                                   settingsController.toggleSystemNotification)
router.patch('/promotionalnotification',verifyToken,                                   settingsController.togglePromotionalNotification)
router.patch('/setapplock',             verifyToken,   validate(setAppLockSchema),     settingsController.setAppLock)
router.patch('/removeapplock',          verifyToken,                                   settingsController.removeAppLock)

module.exports = router