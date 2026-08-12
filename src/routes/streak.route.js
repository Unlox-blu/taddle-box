'use strict';

// ─── src/routes/user.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { streakController }         = require('../modules/streak/streak.container');
const { verifyToken, optionalAuth } = require('../middlewares/auth.middleware');
const { validateRequest }               = require('../middlewares/validator.middleware');
const { paginationQuerySchema } = require('../modules/streak/streak.validator');


router.post('/',        verifyToken,                                                        streakController.createOrUpdate)
router.post('/restore', verifyToken,                                                        streakController.restoreStreak)
router.get('/',         verifyToken,                                                        streakController.getCurrentStreak)
router.get('/history',  verifyToken,    validateRequest({query: paginationQuerySchema}),    streakController.getStreakHistory)

module.exports = router