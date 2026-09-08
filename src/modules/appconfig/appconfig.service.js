'use strict';

const { XP_REWARDS } = require('../xp/xp.rewards');
const config = require('../../config/app.config');

class AppConfigService {
  constructor({ appConfigRepository }) {
    this.appConfigRepo = appConfigRepository;
  }

  async getAppConfig() {
    try {
        const appConfig = await this.appConfigRepo.findAppConfig()
        // Surface backend-controlled XP rewards (refer & earn, daily login,
        // post tiers, events, community) so the app can show accurate
        // amounts without hardcoding them. The amounts themselves are always
        // enforced server-side — these values are display-only.
        const rewards = {
          referral: {
            joinerXp: XP_REWARDS.referralJoinerBonus,
            referrerXp: XP_REWARDS.referralReferrerBonus,
          },
          dailyLogin: XP_REWARDS.dailyLogin,
          postCreate: XP_REWARDS.postCreate,
          postView: XP_REWARDS.postView,
          eventJoin: XP_REWARDS.eventJoin,
          communityJoin: XP_REWARDS.communityJoin,
          taskBonus: XP_REWARDS.taskBonus,
        };
        // Economy rate — the same XP_PER_RUPEE the wallet conversions use, so
        // the app's "100 XP = ₹1" copy can never drift from the server.
        const xpRate = { xpPerRupee: config.XP_PER_RUPEE };
        if(!appConfig)
          return { rewards, xpRate }
        return { ...appConfig, rewards, xpRate }
    } catch (error) {
      throw error;
    }
  }
}

module.exports = AppConfigService;
