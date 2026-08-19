'use strict';

const { createError } = require('../../utils/error.util');
const { notificationService } = require('../notification/notification.container');
const { activeStatusService } = require('../activestatus/activestatus.container');
const { emitFollowRequestCancelled, emitFollowRequestResolved, emitFollowStateChanged } = require('../../sockets/notification.socket');
const appleUtil = require('../../utils/apple.util');

const bcrypt = require('bcryptjs');

class UserService {
  constructor({ userRepository, followerRepository, mediaService, bookmarkService, saveService, storageIntegration, taskService }) {
    this.userRepo = userRepository;
    this.followersRepo = followerRepository;
    this.mediaSvc = mediaService;
    this.bookmarkSvc = bookmarkService;
    this.saveSvc =  saveService;
    this.storageSvc = storageIntegration;
    this.taskSvc = taskService;
  }

  async getProfile({username, userId}) {
    try {
      const user = await this.userRepo.findByUsername(username);
      if (!user) throw createError('User not found', 404);

      let finalUser = user;
      if (userId && userId === user.id) {
        finalUser = await this.userRepo.findByIdPrivate(user.id);
        // Count pending follow requests so the app can surface a review badge.
        try {
          const pendingRequestsCount = await this.followersRepo.countPendingByFollowingId(user.id);
          finalUser.pendingRequestsCount = pendingRequestsCount;
        } catch (err) {
          finalUser.pendingRequestsCount = 0;
        }
      } else if (userId) {
        const isFollow = await this.followersRepo.findByFollowerIdAndFollowingId(userId, user.id);
        finalUser.isFollowing = isFollow?.status === 'active';
        finalUser.followStatus = isFollow?.status || null;
      }

      // Mutuals are GLOBAL — Instagram-style "Followed by": people the VIEWER
      // follows who also follow this profile. Computed for every account
      // (public or private, followed or not, even the viewer's own) because
      // the row describes the viewer's own connections, never the target's
      // private follower list — so no approval/privacy gate applies.
      if (userId) {
        try {
          // Single query — COUNT(*) OVER() returns the full count alongside
          // the first 4 avatars (same pattern as the getMutuals list endpoint).
          const pool = require('../../config/database');
          const mutualRes = await pool.query(
            // NOTE: users.avatar_url is a UUID (media id) — never COALESCE it
            // against the TEXT cloudfront_url or Postgres throws 42804 and the
            // whole mutuals block silently falls back to empty.
            `SELECT u.id, u.name, u.username, am.cloudfront_url AS avatar, COUNT(*) OVER() AS total
             FROM followers f1
             JOIN followers f2 ON f2.follower_id = f1.following_id AND f2.following_id = $2 AND f2.status = 'active'
             JOIN users u ON u.id = f1.following_id AND u.deleted_at IS NULL
             LEFT JOIN media am ON am.id = u.avatar_url AND am.deleted_at IS NULL
             WHERE f1.follower_id = $1 AND f1.status = 'active'
             ORDER BY u.name ASC
             LIMIT 4`,
            [userId, finalUser.id]
          );
          finalUser.mutuals = {
            count: mutualRes.rows[0]?.total || 0,
            users: mutualRes.rows,
          };
        } catch (err) {
          finalUser.mutuals = { count: 0, users: [] };
        }
      }

      // Followers / following lists shipped inline with the profile so the app
      // can open the follow lists without extra API round-trips. Gated by the
      // same privacy rule as the dedicated endpoints: visible for the account
      // owner, public accounts, and approved followers of private accounts.
      try {
        const canSeeLists =
          (!!userId && userId === finalUser.id) ||
          user.privacy === 'public' ||
          !!finalUser.isFollowing;
        if (canSeeLists) {
          const [followersRes, followingRes] = await Promise.all([
            this.followersRepo.findByFollowingId(finalUser.id, 50, 0),
            this.followersRepo.findByFollowerId(finalUser.id, 50, 0),
          ]);
          finalUser.followers = followersRes.followers || [];
          finalUser.following = followingRes.followings || [];
        } else {
          finalUser.followers = [];
          finalUser.following = [];
        }
      } catch (err) {
        finalUser.followers = [];
        finalUser.following = [];
      }

      // Active status (online / last-seen) — Instagram-style: only surfaced to
      // the account owner and approved followers, and only when the target has
      // the Activity Status setting enabled (missing settings row → default ON).
      try {
        const pool = require('../../config/database');
        const settingsRes = await pool.query(
          `SELECT activity_status FROM settings WHERE user_id = $1`,
          [finalUser.id]
        );
        const showStatus = settingsRes.rows[0]?.activity_status !== false;
        const isSelf = !!userId && userId === finalUser.id;
        if (isSelf || (showStatus && !!finalUser.isFollowing)) {
          finalUser.activeStatus = await activeStatusService.resolve(finalUser.id);
        } else {
          finalUser.activeStatus = null;
        }
      } catch (err) {
        finalUser.activeStatus = null;
      }

      // Aggregate XP, Level, Rank
      try {
        const pool = require('../../config/database');
        
        // Fetch XP
        const xpRes = await pool.query(`SELECT xp, total_xp_earned FROM xp WHERE user_id = $1`, [finalUser.id]);
        const xpWallet = xpRes.rows[0];
        const totalXp = xpWallet ? parseInt(xpWallet.total_xp_earned, 10) : 0;
        finalUser.xp = xpWallet ? parseInt(xpWallet.xp, 10) : 0;
        finalUser.totalXpEarned = totalXp;
        finalUser.level = Math.floor(totalXp / 1000) + 1;
        finalUser.rank = finalUser.level > 10 ? 'Pro' : finalUser.level > 5 ? 'Intermediate' : 'Beginner';
        finalUser.xpToNext = finalUser.level * 1000;

        // Fetch communities count
        const commRes = await pool.query(`SELECT COUNT(*) FROM community_members WHERE user_id = $1`, [finalUser.id]);
        finalUser.communitiesJoinedCount = parseInt(commRes.rows[0].count, 10);
        
        // Fetch games played count
        const gamesRes = await pool.query(`SELECT games_played FROM game_stats WHERE user_id = $1`, [finalUser.id]);
        finalUser.gamesPlayedCount = gamesRes.rows[0] ? parseInt(gamesRes.rows[0].games_played, 10) : 0;
        
        // Badges placeholder (could query from a badges table if it exists)
        finalUser.badges = [];
        if (finalUser.xp > 500) finalUser.badges.push({ id: 1, name: 'Active User', emoji: '🔥', color: 'purple' });
        
      } catch (err) {
        console.error('Error fetching aggregated profile stats:', err);
      }

      return finalUser;
    } catch (error) {
      throw error;
    }
  }

  // GEO location telemetry — appends a history row (lat/lng + optional free-text
  // place). Never writes into the user's PROFILE location (users.location).
  async recordLocation({ userId, body }) {
    await this.userRepo.insertLocationCapture(userId, body);
    return { message: 'Location captured' };
  }

  // Privacy: delete all captured geo location history for the user.
  async clearLocationHistory({ userId }) {
    const cleared = await this.userRepo.clearLocationHistory(userId);
    return { message: `Location data cleared`, cleared };
  }

  async updateProfile({userId, body}) {
    try {
      // Mention notifications: @handles in the profile bio notify the mentioned
      // users that their profile was linked (Instagram-style "mentioned you in
      // their bio"). Only NEW mentions fire — re-saving the same bio must not
      // re-notify everyone.
      const newBio = typeof body?.bio === 'string' ? body.bio : null;
      let newMentionUsernames = [];
      if (newBio !== null && body.bio !== undefined) {
        const before = await this.userRepo.findById(userId).catch(() => null);
        const oldBio = before?.bio || '';
        const newUsernames = new Set((newBio.match(/@(\w+)/g) || []).map(m => m.slice(1)));
        const oldUsernames = new Set((String(oldBio).match(/@(\w+)/g) || []).map(m => m.slice(1)));
        newMentionUsernames = [...newUsernames].filter(u => !oldUsernames.has(u));
      }

      const updated = await this.userRepo.updateProfile(userId, body);

      if (newMentionUsernames.length > 0) {
        const actor = await this.userRepo.findById(userId).catch(() => null);
        const actorName = actor?.name || 'Someone';
        for (const username of newMentionUsernames) {
          this.userRepo.findByUsername(username).then(mentioned => {
            if (mentioned && mentioned.id !== userId) {
              notificationService.create({
                type: 'MENTION',
                recipientId: mentioned.id,
                senderId: userId,
                title: 'New mention',
                message: `${actorName} mentioned you in their bio`,
              }).catch(e => console.error(`Failed to notify mentioned user ${username}`, e));
            }
          }).catch(e => console.error(`Failed to find user ${username}`, e));
        }
      }

      return updated;
    } catch (error) {
      throw error;
    }
  }

  async updateAvatar({userId, avatarMediaId}) {
    try {
      const user = await this.userRepo.findAvatarAndBanner(userId)
      const previousAvatarMediaId = user?.avatarUrl;

      const updateAvatar = await this.userRepo.updateAvatar(userId, avatarMediaId);

      if(previousAvatarMediaId && previousAvatarMediaId !== avatarMediaId) {
        this.mediaSvc.clearS3Storage({userId, mediaId: previousAvatarMediaId})
          .catch(error => console.warn('Failed to clear previous avatar media:', error.message));
      }

      return updateAvatar;
    } catch (error) {
      throw error;
    }
  }

  async updateBanner({userId, bannerMediaId}) {
    try {
      const user = await this.userRepo.findAvatarAndBanner(userId)

      if(user.bannerUrl) {
        this.mediaSvc.clearS3Storage({userId, mediaId: user.bannerUrl})
      }
      const updateBanner = await this.userRepo.updateBanner(userId, bannerMediaId);
      return updateBanner;
    } catch (error) {
      throw error;
    }
  }

  async updateUsername({userId, username}) {
    try {
      const existing = await this.userRepo.findByUsername(username);
      if (existing && existing.id !== userId) throw createError('Username is already taken', 409);
      const updated = await this.userRepo.updateUsername(userId, username);
      return updated;
    } catch (error) {
      throw error;
    }
  }

  async updatePrivacy({userId, privacy}) {
    try {
      await this.userRepo.updatePrivacy(userId, privacy);

      // Going public auto-accepts every pending follow request — the requests
      // no longer make sense once the account is open, and the requesters
      // expect to be following immediately (the app warns the user first).
      let accepted = 0;
      if (privacy === 'public') {
        const acceptedIds = await this.followersRepo.approveAllPendingByFollowingId(userId);
        accepted = acceptedIds.length;
        if (accepted > 0) {
          const me = await this.userRepo.findById(userId);
          for (const followerId of acceptedIds) {
            await this.userRepo.incrementFollowingCount(followerId);
            await this.userRepo.incrementFollowerCount(userId);
            await notificationService.publishNotification({
              type: 'FOLLOW',
              recipientId: followerId,
              senderId: userId,
              resourceType: 'user',
              resourceId: userId,
              title: 'Follow request approved',
              message: `${me.name} (@${me.username}) made their account public — you are now following them`,
            });
          }
        }
      }
      return { accepted };
    } catch (error) {
      throw error;
    }
  }

  async acceptAllFollowRequests({userId}) {
    try {
      const count = await this.followersRepo.countPendingByFollowingId(userId);
      if (count === 0) return { message: 'No pending follow requests', accepted: 0 };

      const acceptedIds = await this.followersRepo.approveAllPendingByFollowingId(userId);
      for (const followerId of acceptedIds) {
        await this.userRepo.incrementFollowingCount(followerId);
        await this.userRepo.incrementFollowerCount(userId);
      }
      return { message: `Accepted ${acceptedIds.length} follow request${acceptedIds.length === 1 ? '' : 's'}`, accepted: acceptedIds.length };
    } catch (error) {
      throw error;
    }
  }

  async getFollowRequests({userId, limit, offset}) {
    try {
      const { requests, total } = await this.followersRepo.findPendingByFollowingId(userId, limit, offset);
      return { requests, total };
    } catch (error) {
      throw error;
    }
  }

  async rejectFollowRequest({userId: followingId, followerId}) {
    try {
      const isFollow = await this.followersRepo.findByFollowerIdAndFollowingId(followerId, followingId);
      if (!isFollow) throw createError('No follow request found', 404);
      if (isFollow.status === 'active')
        throw createError('This user is already following you. Use remove follower instead.', 409);

      await this.followersRepo.hardDelete(followerId, followingId);
      return { message: 'Follow request rejected' };
    } catch (error) {
      throw error;
    }
  }

  // Instagram-style mutuals list: users the VIEWER follows who also follow this
  // profile (same query the profile header uses for the "Followed by x" row).
  async getMutuals({viewerId, username, limit, offset, search = ''}) {
    try {
      const user = await this.userRepo.findByUsername(username);
      if (!user) throw createError('User not found', 404);

      // Mutuals are GLOBAL (see getProfile): the list describes the viewer's
      // own mutual connections, not the target's private follower list, so no
      // follow/approval gate applies — public or private account alike.
      const pool = require('../../config/database');
      const q = search ? `%${search}%` : '';
      const { rows } = await pool.query(
        // users.avatar_url is a UUID (media id) — same fix as getProfile.
        `SELECT u.id, u.name, u.username, am.cloudfront_url AS avatar_url, COUNT(*) OVER() AS total
         FROM followers f1
         JOIN followers f2
           ON f2.follower_id = f1.following_id
          AND f2.following_id = $2
          AND f2.status = 'active'
         JOIN users u ON u.id = f1.following_id AND u.deleted_at IS NULL
         LEFT JOIN media am ON am.id = u.avatar_url AND am.deleted_at IS NULL
         WHERE f1.follower_id = $1 AND f1.status = 'active'
         AND ($5 = '' OR u.username ILIKE $5 OR u.name ILIKE $5)
         ORDER BY u.name ASC
         LIMIT $3 OFFSET $4`,
        [viewerId, user.id, limit, offset, q]
      );
      const total = rows[0]?.total || 0;
      const users = rows.map((r) => ({
        id: r.id,
        name: r.name,
        username: r.username,
        avatarUrl: r.avatar_url,
      }));
      return { users, total: parseInt(total, 10) };
    } catch (error) {
      throw error;
    }
  }

  async getFollowers({userId, username, limit, offset, search}) {
    try {
      const user = await this.userRepo.findByUsername(username);
      if (!user) throw createError('User not found', 404);

      if(user.id !== userId && user.privacy !== 'public'){
        const isFollow = await this.followersRepo.findByFollowerIdAndFollowingId( userId, user.id );
  
        if(!isFollow || isFollow.status !== 'active')
          throw createError("You are not authorized to view this user's followers", 403);
      }

      const { followers, total } = await this.followersRepo.findByFollowingId(
        user.id,
        limit,
        offset,
        search
      );
      return { followers, total };
    } catch (error) {
      throw error;
    }
  }

  async getFollowing({userId, username, limit, offset, search}) {
    try {
      const user = await this.userRepo.findByUsername(username);
      if (!user) throw createError('User not found', 404);

      if(user.id !== userId && user.privacy !== 'public'){
        const isFollow = await this.followersRepo.findByFollowerIdAndFollowingId( userId, user.id );
  
        if(!isFollow || isFollow.status !== 'active')
          throw createError("You are not authorized to view this user's followings", 403);
      }

      const { followings, total } = await this.followersRepo.findByFollowerId(
        user.id,
        limit,
        offset,
        search
      );
      return { followings, total };
    } catch (error) {
      throw error;
    }
  }

  async getbookmarked({userId, limit, offset}) {
    try {
      const {bookmark, total} = await this.bookmarkSvc.getBookmarks({userId, limit, offset})

      return {bookmark, total}
    } catch (error) {
      throw error
    }
  }

  async getsaved({userId, limit, offset}) {
    try {
      const {saved, total} = await this.saveSvc.getSave({userId, limit, offset})

      return {saved, total}
    } catch (error) {
      throw error
    }
  }

  async followUser({userId: followerId, username}) {
    try {
      const followingUser = await this.userRepo.findByUsername(username);
      if (!followingUser) throw createError('User not found', 404);

      const followingId = followingUser.id;
      const privacy = followingUser.privacy
      
      if (followerId === followingId) throw createError("You can't follow yourself", 409);

      const isFollow = await this.followersRepo.findByFollowerIdAndFollowingId( followerId, followingId );
      if (isFollow) {
        if (isFollow.status === 'pending')
          throw createError('Follow request already sent', 409);
        throw createError("You are already following this user", 409);
      }


      const follower = await this.userRepo.findById(followerId)
      
      const jobdata = {
        followingId: followingId, 
        followerId: followerId, 
        followerName: follower.name, 
        followerUsername: follower.username
      }
      

      if(privacy === "private") {
        await this.followersRepo.createPendingFolow(followerId, followingId);
        await notificationService.publishNotification({
          type: 'REQUEST_TO_FOLLOW',
          recipientId: followingId,
          senderId: followerId,
          resourceType: 'user',
          resourceId: followerId,
          title: 'Request to follow',
          message: `${follower.name} requested to follow you`,
        })
        return {message: "Request to follow"}
      }


      await this.followersRepo.createFolow(followerId, followingId);
      await this.userRepo.incrementFollowingCount(followerId);
      await this.userRepo.incrementFollowerCount(followingId);
      await notificationService.publishNotification({
        type: 'FOLLOW',
        recipientId: followingId,
        senderId: followerId,
        resourceType: 'user',
        resourceId: followerId,
        title: 'New follower',
        message: `${follower.name} (@${follower.username}) started following you`,
      })

      // Real-time follow-state sync: the caller's own open notification rows for
      // this target now show "Following", and if the target already followed the
      // caller (mutual), the target's "Follow Back" button flips instantly too.
      emitFollowStateChanged(followerId, { otherUserId: followingId, isFollowing: true });
      const mutual = await this.followersRepo.findByFollowerIdAndFollowingId(followingId, followerId);
      if (mutual?.status === 'active') {
        emitFollowStateChanged(followingId, { otherUserId: followerId, isFollowing: true });
      }

      return {message: 'Follow successfully'}
    } catch (error) {
      throw error;
    }
  }

  async approveTofollow({userId: followingId, followerId}) {
    try {
      const isFollow = await this.followersRepo.findByFollowerIdAndFollowingId( followerId, followingId );

      if(!isFollow)
        throw createError("No follow request found", 404);

      if (isFollow.status === 'active') 
        throw createError("The user is already following you", 409);

      await this.followersRepo.approvefollower(followerId, followingId)
      await this.userRepo.incrementFollowingCount(followerId);
      await this.userRepo.incrementFollowerCount(followingId);

      // Resolve the approver's own "requested to follow" notification row.
      // Distinct event — a resolved request is NOT a withdrawal, so the app
      // must not flip the just-approved row to "Request withdrawn".
      emitFollowRequestResolved(followingId, { followerId });

      const following = await this.userRepo.findById(followingId)
      const jobdata = {
        followingId: followingId, 
        followerId: followerId, 
        followingName: following.name, 
        followingname: following.username
      }
      await notificationService.publishNotification({
        type: 'FOLLOW',
        recipientId: followerId,
        senderId: followingId,
        resourceType: 'user',
        resourceId: followingId,
        title: 'Follow request approved',
        message: `${following.name} (@${following.username}) approved your request`,
      })
      return {message: "Request approved to follow"}
    } catch (error) {
      throw error
    }
  }

  async unfollowUser({userId: followerId, username}) {
    try {
      const targetUser = await this.userRepo.findByUsername(username);
      if (!targetUser) throw createError('User not found', 404);

      const followingId = targetUser.id;

      const isFollow = await this.followersRepo.findByFollowerIdAndFollowingId(
        followerId,
        followingId
      );
      if (!isFollow) throw createError("You are not following this profile", 404);

      await this.followersRepo.hardDelete(followerId, followingId);

      // Pending requests never incremented the counts (they're only bumped on
      // approval), so only a cancelled *active* follow should decrement them.
      // Otherwise cancelling a request would corrupt both counters.
      if (isFollow.status === 'active') {
        await this.userRepo.decrementFollowingCount(followerId);
        await this.userRepo.decrementFollowerCount(followingId);
        // The caller's open "<target> started following you" rows must show the
        // Follow Back button again.
        emitFollowStateChanged(followerId, { otherUserId: followingId, isFollowing: false });
      } else if (isFollow.status === 'pending') {
        // Cancelling a pending request — tell the recipient so their stale
        // Approve/Decline buttons disappear in real time.
        emitFollowRequestCancelled(followingId, { followerId });
      }
    } catch (error) {
      throw error;
    }
  }

  async removeFollower({userId: followingId, username}) {
    try {
      const targetUser = await this.userRepo.findByUsername(username);
      if (!targetUser) throw createError('User not found', 404);

      const followerId = targetUser.id;

      const isFollowing = await this.followersRepo.findByFollowerIdAndFollowingId(
        followerId,
        followingId
      );
      if (!isFollowing) throw createError('This profile already not following you', 409);

      await this.followersRepo.hardDelete(followerId, followingId);

      await this.userRepo.decrementFollowingCount(followingId);
      await this.userRepo.decrementFollowerCount(followerId);
    } catch (error) {
      throw error;
    }
  }

  async deleteAccount(userId) {
    try {
      const user = await this.userRepo.findByIdAuth(userId);
      if (!user) throw createError('User not found', 404);

      // If they signed in with Apple and we have a refresh token, we revoke it here.
      if (user.appleRefreshToken) {
        await appleUtil.revokeAppleToken(user.appleRefreshToken); 
      }

      await this.userRepo.hardDelete(userId);
      return { message: 'Account deleted successfully' };
    } catch (error) {
      throw error;
    }
  }

  async setupAppLock({ userId, pin, enableGlobal }) {
    if (!pin || pin.length !== 4) throw createError('PIN must be 4 digits', 400);
    const hash = await bcrypt.hash(pin, 10);
    await this.userRepo.updateAppLock(userId, hash, enableGlobal);
    return { message: 'App lock PIN set successfully' };
  }

  async verifyAppLock({ userId, pin }) {
    if (!pin) throw createError('PIN is required', 400);
    const appLock = await this.userRepo.getAppLock(userId);
    if (!appLock) {
      // Corrupt state: lock is enabled but no PIN hash — auto-heal by disabling the lock
      await this.userRepo.removeAppLock(userId);
      throw createError('App lock PIN not set up. Lock has been disabled — please set up a new PIN.', 400);
    }
    
    const isValid = await bcrypt.compare(pin, appLock);
    if (!isValid) throw createError('Invalid PIN', 401);
    
    return { valid: true };
  }

  async toggleAppLockEnabled({ userId, pin, isEnabled }) {
    // Verify PIN first
    await this.verifyAppLock({ userId, pin });
    await this.userRepo.toggleAppLockEnabled(userId, isEnabled);
    return { message: `Global App Lock ${isEnabled ? 'enabled' : 'disabled'}` };
  }

  async resetAppLock({ userId, password, newPin }) {
    if (!newPin || newPin.length !== 4) throw createError('New PIN must be 4 digits', 400);
    if (!password) throw createError('Password is required', 400);
    
    const user = await this.userRepo.findByIdPrivate(userId);
    if (!user) throw createError('User not found', 404);

    // Verify password (assuming auth format is passwordHash)
    const { rows } = await require('../../config/database').query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    const passwordHash = rows[0]?.password_hash;
    if (!passwordHash) throw createError('Password not set for this account', 400);

    const isPasswordValid = await bcrypt.compare(password, passwordHash);
    if (!isPasswordValid) throw createError('Invalid password', 401);

    const hash = await bcrypt.hash(newPin, 10);
    await this.userRepo.updateAppLock(userId, hash);
    return { message: 'App lock PIN reset successfully' };
  }

  async removeAppLock({ userId, pin }) {
    if (!pin) throw createError('PIN is required', 400);
    
    const appLock = await this.userRepo.getAppLock(userId);
    if (!appLock) {
      // Nothing to remove — just ensure app_lock_enabled is false and return success
      await this.userRepo.removeAppLock(userId);
      return { message: 'App lock cleared' };
    }

    const isValid = await bcrypt.compare(pin, appLock);
    if (!isValid) throw createError('Invalid PIN', 401);

    // Wipe PIN hash and disable lock
    await this.userRepo.removeAppLock(userId);
    return { message: 'App lock PIN removed successfully' };
  }
}

module.exports = UserService;
