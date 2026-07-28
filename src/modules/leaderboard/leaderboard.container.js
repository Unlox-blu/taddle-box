'use strict';

const leaderboardRepository = require('./leaderboard.repository');
const LeaderboardService = require('./leaderboard.service');
const LeaderboardController = require('./leaderboard.controller');

const leaderboardService = new LeaderboardService({leaderboardRepository});
const leaderboardController = new LeaderboardController({leaderboardService});

module.exports = {leaderboardController, leaderboardService, leaderboardRepository};
