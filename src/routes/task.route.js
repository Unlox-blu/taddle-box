'use strict';

// ─── src/routes/user.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { taskController }         = require('../container');
const { verifyToken } = require('../middlewares/auth.middleware');
const { validate }               = require('../middlewares/validator.middleware');


router.get('/',              verifyToken,                       taskController.getCurrentStreak)

module.exports = router