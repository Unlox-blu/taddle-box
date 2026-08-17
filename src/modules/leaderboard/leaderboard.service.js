'use strict';

class LeaderboardService {
  constructor({ leaderboardRepository }) {
    this.leaderboardRepo = leaderboardRepository;
  }

  async getWeeklyLeaderboards({limit, userId, type}) {
    // Single-tab fetch (leaderboards:changed live refresh path) vs. the full
    // four-tab bundle (initial load / pull-to-refresh).
    if (type) {
      return this.leaderboardRepo.getWeeklyLeaderboard({type, limit, userId});
    }
    return this.leaderboardRepo.getWeeklyLeaderboards({limit, userId});
  }
}

module.exports = LeaderboardService;
