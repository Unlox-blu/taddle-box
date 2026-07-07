'use strict';

const { createError } = require('../../utils/error.util');
const UserModel = require('./user.model');
const FollowersModel = require('./followers.model');
const { uploadFile } = require('../../integrations/storage/cloudinary.service');
const { startNotificationWorker } = require('../../jobs/workers/notification/notification.worker');
const { addNotificationJob } = require('../../jobs/queues/notification.queue');

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

      if (userId && userId === user.id) {
        const privateUser = await this.userRepo.findByIdPrivate(user.id);
        return privateUser;
      }
      return user;
    } catch (error) {
      throw error;
    }
  }

  async updateProfile({userId, body}) {
    try {
      const updated = await this.userRepo.updateProfile(userId, body);
      return UserModel.format(updated);
    } catch (error) {
      throw error;
    }
  }

  async updateAvatar({userId, avatarMediaId}) {
    try {
      const user = await this.userRepo.findAvatarAndBanner(userId)

      if(user.avatarUrl) {
        this.mediaSvc.clearS3Storage({userId, mediaId: user.avatarUrl})
      }

      const updateAvatar = await this.userRepo.updateAvatar(userId, avatarMediaId);
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
      return UserModel.format(updated);
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

      if(user.privacy !== 'public'){
        const isFollow = await this.followersRepo.findByFollowerIdAndFollowingId( userId, user.id );
  
        if(!isFollow || isFollow.status !== 'active')
          throw createError('You are not authorized to get the follower', 403)
      }

      const { followings, total } = await this.followersRepo.findByFollowingId(
        user.id,
        limit,
        offset
      );
      const followers = followings.length ? followings.map(FollowersModel.format) : [];
      return { followers, total };
    } catch (error) {
      throw error;
    }
  }

  async getFollowing({userId, username, limit, offset}) {
    try {
      const user = await this.userRepo.findByUsername(username);
      if (!user) throw createError('User not found', 404);

      if(user.privacy !== 'public'){
        const isFollow = await this.followersRepo.findByFollowerIdAndFollowingId( userId, user.id );
  
        if(!isFollow || isFollow.status !== 'active')
          throw createError('You are not authorized to get the follower', 403)
      }

      const { followers, total } = await this.followersRepo.findByFollowerId(
        user.id,
        limit,
        offset
      );
      const followings = followers.length ? followers.map(FollowersModel.format) : [];
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
      
      if (followerId === followingId) throw createError('You cannot follow yourself', 409);

      const isFollow = await this.followersRepo.findByFollowerIdAndFollowingId( followerId, followingId );
      if (isFollow) throw createError('You already following this profile', 409);


      const follower = await this.userRepo.findById(followerId)
      
      const jobdata = {
        followingId: followingId, 
        followerId: followerId, 
        followerName: follower.name, 
        followerUsername: follower.username
      }
      

      if(privacy === "private") {
        await this.followersRepo.createPendingFolow(followerId, followingId);
        await addNotificationJob('request_to_follow', jobdata)
        return {message: "Request to follow"}
      }


      await this.followersRepo.createFolow(followerId, followingId);
      await this.userRepo.incrementFollowingCount(followerId);
      await this.userRepo.incrementFollowerCount(followingId);
      await addNotificationJob('new_follower',jobdata)

      return {message: 'Follow successfully'}
    } catch (error) {
      throw error;
    }
  }

  async approveTofollow({userId: followingId, followerId}) {
    try {
      const isFollow = await this.followersRepo.findByFollowerIdAndFollowingId( followerId, followingId );

      if(!isFollow)
        throw createError('He did not request to follow', 400);

      if (isFollow.status === 'active') 
        throw createError('He already following this profile', 409);

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
      await addNotificationJob('approved_to_follow', jobdata)
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

      if (followerId === followingId) throw createError('You cannot unFollow yourself', 409);

      const isFollow = await this.followersRepo.findByFollowerIdAndFollowingId(
        followerId,
        followingId
      );
      if (!isFollow) throw createError('You are not following this profile', 409);

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

      if (followerId === followingId) throw createError('You cannot remove yourself', 400);

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
}

module.exports = UserService;
