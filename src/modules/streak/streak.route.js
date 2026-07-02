'use strict';

// ─── src/routes/user.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { streakController }         = require('./streak.container');
const { verifyToken, optionalAuth } = require('../../middlewares/auth.middleware');
const { validate }               = require('../../middlewares/validator.middleware');


router.post('/',             verifyToken,                       streakController.createOrUpdate)
router.get('/',              verifyToken,                       streakController.getCurrentStreak)
router.get('/history',       verifyToken,                       streakController.getStreakHistory)

module.exports = router