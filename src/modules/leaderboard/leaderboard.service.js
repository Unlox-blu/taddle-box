'use strict';

class LeaderboardService {
  constructor({ leaderboardRepository }) {
    this.leaderboardRepo = leaderboardRepository;
  }

  async getWeeklyLeaderboards({limit, userId}) {
    return this.leaderboardRepo.getWeeklyLeaderboards({limit, userId});
  }
}

module.exports = LeaderboardService;
