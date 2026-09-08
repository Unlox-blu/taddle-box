'use strict';

/**
 * Single source of truth for XP rewards granted by the platform.
 *
 * Kept in the backend (not the app) so reward amounts can be adjusted
 * without shipping an app release. Exposed to the app through the
 * public /app-config endpoint.
 *
 * Every code path that GRANTS XP must read its amount from here:
 *   - referral signup/invite            → referralJoinerBonus / referralReferrerBonus
 *   - daily login claim                 → dailyLogin (server overrides the client amount)
 *   - post creation                     → postCreate (tiered by content types)
 *   - post view XP                      → postView (tiered by content types, server overrides)
 *   - free event registration           → eventJoin
 *   - community join                    → communityJoin
 * Never hardcode an XP amount in a feature module or in the app.
 */
const XP_REWARDS = {
  // Refer & Earn — a new user who signs up with a referral code, and the
  // user whose code was used. Both sides get rewarded.
  referralJoinerBonus: 500, // sourceType: referral_signup_bonus
  referralReferrerBonus: 500, // sourceType: referral_invite_bonus

  // Daily login reward — claimed by the app, but the server ignores whatever
  // amount the client sends and credits this exact value.
  dailyLogin: 50, // sourceType: `Daily Login - YYYY-MM-DD`

  // Post creation reward — tiered by how many distinct content types the
  // post carries (text + visual media + audio media). 1 type → singleType,
  // 2 types → twoTypes, 3 types → threeTypes.
  postCreate: {
    singleType: 2,
    twoTypes: 5,
    threeTypes: 10,
  },

  // Post view reward — same tiering as creation (the viewer earns for
  // consuming the post). The server computes this from the post row and
  // overrides the client's amount; it is also attached to post responses
  // as `xpReward` so the app pill always shows the real value.
  postView: {
    singleType: 2,
    twoTypes: 5,
    threeTypes: 10,
  },

  // Free event registration reward.
  eventJoin: 50, // sourceType: event_register_<eventId>

  // Community join reward (active joins only, not pending requests).
  communityJoin: 20, // sourceType: community_join_<communityId>

  // Task-board milestone bonuses — credited by task.service every 5th post,
  // every 5th share, and at the 60%/100% profile-completion checkpoints.
  taskBonus: 5, // sourceType: Post | Post share | profile Completion
};

/**
 * Counts the distinct content types a post carries: text / visual media /
 * audio media (each counts at most once).
 */
const countPostTypes = (post = {}) => {
  const { content, media } = post || {};
  const hasText = !!(content && String(content).trim().length > 0);
  const items = Array.isArray(media) ? media : [];
  const hasVisual = items.some(
    (m) => m && m.media_type !== 'audio' && m.type !== 'audio'
  );
  const hasAudio = items.some(
    (m) => m && (m.media_type === 'audio' || m.type === 'audio')
  );
  return (hasText ? 1 : 0) + (hasVisual ? 1 : 0) + (hasAudio ? 1 : 0);
};

/**
 * Resolves the tiered post reward (create or view) for a post-like object
 * ({ content, media }) using the given tier config. Falls back to the
 * single-type tier when the post can't be inspected.
 */
const postRewardFor = (tiers, post) => {
  const count = countPostTypes(post || {});
  if (count >= 3) return tiers.threeTypes;
  if (count === 2) return tiers.twoTypes;
  return tiers.singleType;
};

module.exports = { XP_REWARDS, countPostTypes, postRewardFor };