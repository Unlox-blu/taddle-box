'use strict';

const { XP_REWARDS } = require('../xp/xp.rewards');

class AppConfigService {
  constructor({ appConfigRepository }) {
    this.appConfigRepo = appConfigRepository;
  }

  async getAppConfig() {
    try {
        const appConfig = await this.appConfigRepo.findAppConfig()
        // Surface backend-controlled XP rewards (refer & earn etc.) so the
        // app can show accurate amounts without hardcoding them.
        const rewards = {
          referral: {
            joinerXp: XP_REWARDS.referralJoinerBonus,
            referrerXp: XP_REWARDS.referralReferrerBonus,
          },
        };
        if(!appConfig)
          return { rewards }
        return { ...appConfig, rewards }
    } catch (error) {
      throw error;
    }
  }
}

module.exports = AppConfigService;
