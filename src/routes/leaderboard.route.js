'use strict';

const router = require('express').Router();
const { verifyToken } = require('../middlewares/auth.middleware');
const { leaderboardController } = require('../modules/leaderboard/leaderboard.container');

router.get('/weekly', verifyToken, leaderboardController.getWeeklyLeaderboards);

module.exports = router;
