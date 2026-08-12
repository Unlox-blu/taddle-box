'use strict';

class LeaderboardService {
  constructor({ leaderboardRepository }) {
    this.leaderboardRepo = leaderboardRepository;
  }

  async getWeeklyLeaderboards({limit}) {
    return this.leaderboardRepo.getWeeklyLeaderboards({limit});
  }
}

module.exports = LeaderboardService;
