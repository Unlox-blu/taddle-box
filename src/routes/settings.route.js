'use strict';

// ─── src/routes/user.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { settingsController }         = require('../container');
const { verifyToken } = require('../middlewares/auth.middleware');
const { validate }               = require('../middlewares/validator.middleware');
const { setAppLockSchema, setThemeSchema } = require('../validators/settings.validator');


router.post('/',             verifyToken,                                   settingsController.createSettings)
router.get('/',              verifyToken,                                   settingsController.getSettings)
router.patch('/theme',       verifyToken,   validate(setThemeSchema),       settingsController.setTheme)
router.patch('/notification',verifyToken,                                   settingsController.toggleNotification)
router.patch('/applock',     verifyToken,   validate(setAppLockSchema),     settingsController.setAppLock)

module.exports = router