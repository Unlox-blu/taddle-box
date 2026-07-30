'use strict';

const { createError } = require('../../utils/error.util');
const { notificationService } = require('../notification/notification.container');
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
      } else if (userId) {
        const isFollow = await this.followersRepo.findByFollowerIdAndFollowingId(userId, user.id);
        finalUser.isFollowing = isFollow?.status === 'active';
        finalUser.followStatus = isFollow?.status || null;
      }

      // Aggregate XP, Level, Rank
      try {
        const pool = require('../../config/database');
        
        // Fetch XP
        const xpRes = await pool.query(`SELECT xp FROM xp WHERE user_id = $1`, [finalUser.id]);
        const xp = xpRes.rows[0] ? parseInt(xpRes.rows[0].xp, 10) : 0;
        finalUser.xp = xp;
        finalUser.level = Math.floor(xp / 1000) + 1;
        finalUser.rank = finalUser.level > 10 ? 'Pro' : finalUser.level > 5 ? 'Intermediate' : 'Beginner';
        finalUser.xpToNext = finalUser.level * 1000;

        // Fetch communities count
        const commRes = await pool.query(`SELECT COUNT(*) FROM community_members WHERE user_id = $1`, [finalUser.id]);
        finalUser.communitiesJoinedCount = parseInt(commRes.rows[0].count, 10);
        
        // Badges placeholder (could query from a badges table if it exists)
        finalUser.badges = [];
        if (xp > 500) finalUser.badges.push({ id: 1, name: 'Active User', emoji: '🔥', color: 'purple' });
        
      } catch (err) {
        console.error('Error fetching aggregated profile stats:', err);
      }

      return finalUser;
    } catch (error) {
      throw error;
    }
  }

  async updateProfile({userId, body}) {
    try {
      const updated = await this.userRepo.updateProfile(userId, body);
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
    } catch (error) {
      throw error;
    }
  }

  async getFollowers({userId, username, limit, offset}) {
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
        offset
      );
      return { followers, total };
    } catch (error) {
      throw error;
    }
  }

  async getFollowing({userId, username, limit, offset}) {
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
        offset
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
      if (isFollow) throw createError("You are already following this user", 409);


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
          actorId: followerId,
          entityId: followingId,
          entityType: 'user',
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
        actorId: followerId,
        entityId: followingId,
        entityType: 'user',
        title: 'New follower',
        message: `${follower.name} started following you`,
      })

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
        actorId: followingId,
        entityId: followingId,
        entityType: 'user',
        title: 'Follow request approved',
        message: `${following.name} approved your request`,
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

      await this.userRepo.decrementFollowingCount(followerId);
      await this.userRepo.decrementFollowerCount(followingId);
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
