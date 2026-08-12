'use strict';

/**
 * Single source of truth for XP rewards granted by the platform.
 *
 * Kept in the backend (not the app) so reward amounts can be adjusted
 * without shipping an app release. Exposed to the app through the
 * public /app-config endpoint.
 */
const XP_REWARDS = {
  // Refer & Earn — a new user who signs up with a referral code, and the
  // user whose code was used. Both sides get rewarded.
  referralJoinerBonus: 500, // sourceType: referral_signup_bonus
  referralReferrerBonus: 500, // sourceType: referral_invite_bonus
};

module.exports = { XP_REWARDS };
