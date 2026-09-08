'use strict';

/**
 * XP claim events — the ONLY way the client can earn XP.
 *
 * The client sends an event name (+ the minimal parameters that identify the
 * claim). The backend owns EVERYTHING else: it computes the amount from
 * XP_REWARDS, builds the sourceType string, and verifies the event actually
 * happened. The client never sends an amount, a transaction type, or a
 * source string.
 *
 * Adding a new claim event:
 *   1. Add the reward amount to XP_REWARDS (xp.rewards.js).
 *   2. Add an entry here with a `verify` function.
 *   3. Add the event name to the claimXPSchema enum (xp.validator.js).
 *   Nothing else — no route, no controller change.
 *
 * Each handler receives { userId, payload, xpRepo, postRepo, xpService } and
 * must return { xp, sourceType, transactionType } — or throw createError()
 * to reject the claim, or return null to signal "already claimed" (the
 * service turns that into an idempotent { alreadyClaimed: true }).
 *
 * Handlers that need repositories beyond xpRepo/postRepo lazy-require them
 * (same pattern as the notificationService require in xp.service.creditXP)
 * so the xp container stays free of cross-module wiring.
 */
const { createError } = require('../../utils/error.util');
const { XP_REWARDS, postRewardFor } = require('./xp.rewards');

const CLAIM_EVENTS = {
  /**
   * daily_login — one claim per user per local day. The backend derives the
   * day from ITS OWN clock (never the client's date), so date spoofing is
   * impossible.
   */
  daily_login: async ({ userId, xpRepo }) => {
    const xpWallet = await xpRepo.findByUserId(userId);
    if (!xpWallet) throw createError('XP wallet not found', 404);

    const today = new Date();
    const dayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const sourceType = `Daily Login - ${dayKey}`;

    const claimed = await xpRepo.checkDailyTransactionBySource(xpWallet.id, sourceType);
    // Already claimed today → idempotent no-op (null = alreadyClaimed in
    // xp.service.claimReward), not an error the client has to handle.
    if (claimed) return null;

    return { xp: XP_REWARDS.dailyLogin, sourceType, transactionType: 'bonus' };
  },

  /**
   * post_view — reward for viewing a post. The backend loads the post and
   * computes the tiered amount from the post's actual content types. The
   * client sends nothing but the post id.
   */
  post_view: async ({ userId, payload, xpRepo, postRepo }) => {
    const postId = payload?.postId;
    if (!postId) throw createError('postId is required', 400);

    const post = await postRepo.findById(postId).catch(() => null);
    if (!post) throw createError('Post not found', 404);

    // Self-views earn nothing.
    if (String(post.author_id) === String(userId)) {
      throw createError('You cannot earn XP from your own post', 400);
    }

    const xpWallet = await xpRepo.findByUserId(userId);
    if (!xpWallet) throw createError('XP wallet not found', 404);

    const sourceType = `view_post_${postId}`;
    const claimed = await xpRepo.getTransactionsBySource(xpWallet.id, sourceType);
    // Already claimed for this post → idempotent no-op (null = alreadyClaimed
    // in xp.service.claimReward), not an error the client has to handle.
    if (claimed && claimed.length > 0) return null;

    const xp = postRewardFor(XP_REWARDS.postView, {
      content: post.content,
      media: post.media,
    });
    return { xp, sourceType, transactionType: 'earned' };
  },

  /**
   * event_join — reward for a FREE event registration. The backend verifies
   * the registration actually exists (and wasn't cancelled) and that the
   * event is free; paid events never award join XP. Uses the SAME sourceType
   * as the auto-credit in event.service.register, so the idempotency check
   * prevents double payment — this claim is the recovery path for when the
   * fire-and-forget auto-credit failed.
   */
  event_join: async ({ userId, payload, xpRepo }) => {
    const eventId = payload?.eventId;
    if (!eventId) throw createError('eventId is required', 400);

    const eventRepo = require('../event/event.repository');
    const event = await eventRepo.findById(eventId).catch(() => null);
    if (!event) throw createError('Event not found', 404);
    if (!event.isFree) throw createError('Only free events award join XP', 400);

    const attendee = await eventRepo.getAttendee(eventId, userId).catch(() => null);
    if (!attendee || attendee.status === 'cancelled') {
      throw createError('You are not registered for this event', 403);
    }

    const xpWallet = await xpRepo.findByUserId(userId);
    if (!xpWallet) throw createError('XP wallet not found', 404);

    const sourceType = `event_register_${eventId}`;
    const claimed = await xpRepo.getTransactionsBySource(xpWallet.id, sourceType);
    if (claimed && claimed.length > 0) return null; // already claimed → no-op

    return { xp: XP_REWARDS.eventJoin, sourceType, transactionType: 'earned' };
  },

  /**
   * community_join — reward for joining a community. The backend verifies
   * the membership row exists with status 'active' (pending requests earn
   * nothing). Uses the SAME sourceType as the auto-credit in
   * community.service.join, so the idempotency check prevents double payment.
   */
  community_join: async ({ userId, payload, xpRepo }) => {
    const communityId = payload?.communityId;
    if (!communityId) throw createError('communityId is required', 400);

    const communityRepo = require('../community/community.repository');
    const community = await communityRepo.findById(communityId).catch(() => null);
    if (!community) throw createError('Community not found', 404);

    const member = await communityRepo.isMember(communityId, userId).catch(() => null);
    if (!member || member.status !== 'active') {
      throw createError('You are not an active member of this community', 403);
    }

    const xpWallet = await xpRepo.findByUserId(userId);
    if (!xpWallet) throw createError('XP wallet not found', 404);

    const sourceType = `community_join_${communityId}`;
    const claimed = await xpRepo.getTransactionsBySource(xpWallet.id, sourceType);
    if (claimed && claimed.length > 0) return null; // already claimed → no-op

    return { xp: XP_REWARDS.communityJoin, sourceType, transactionType: 'earned' };
  },
};

module.exports = { CLAIM_EVENTS };