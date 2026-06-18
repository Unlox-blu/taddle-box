'use strict';

const { createError } = require('../utils/error.util');
const UserModel = require('../models/user.model');
const FollowersModel = require('../models/followers.model');
const { uploadFile } = require('../integrations/storage/cloudinary.service');
const { tryCatch } = require('bullmq');
const { startNotificationWorker } = require('../jobs/workers/notification.worker');
const { addNotificationJob } = require('../jobs/queues/notification.queue');

class UserService {
  constructor({ userRepository, storageIntegration, followerRepository }) {
    this.userRepo = userRepository;
    this.followersRepo = followerRepository;
    this.storageSvc = storageIntegration;
  }

  async getProfile(username, requesterId = null) {
    try {
      const user = await this.userRepo.findByUsername(username);
      if (!user) throw createError('User not found', 404);

      // Return sanitized private fields if viewing own profile
      if (requesterId && requesterId === user.id) {
        const privateUser = await this.userRepo.findByIdPrivate(user.id);
        return UserModel.format(privateUser);
      }
      return UserModel.format(user);
    } catch (error) {
      throw error;
    }
  }

  async updateProfile(userId, fields) {
    try {
      const updated = await this.userRepo.updateProfile(userId, fields);
      return UserModel.format(updated);
    } catch (error) {
      throw error;
    }
  }

  async updateAvatar(userId, file) {
    try {
      if (!file || !file.avatar || !file.avatar.data) throw createError('No file provided', 400);

      const {url} = await uploadFile(file.avatar.data, 'avatar', userId);

      const updateAvatar = await this.userRepo.updateAvatar(userId, url);
      return updateAvatar;
    } catch (error) {
      throw error;
    }
  }

  async updateBanner(userId, file) {
    try {
      if (!file || !file.banner || !file.banner.data) throw createError('No file provided', 400);

      const {url} = await uploadFile(file.banner.data, 'banner', userId);

      const updateAvatar = await this.userRepo.updateBanner(userId, url);
      return updateAvatar;
    } catch (error) {
      throw error;
    }
  }

  async updateUsername(userId, username) {
    try {
      const existing = await this.userRepo.findByUsername(username);
      if (existing && existing.id !== userId) throw createError('Username is already taken', 409);
      const updated = await this.userRepo.updateUsername(userId, username);
      return UserModel.format(updated);
    } catch (error) {
      throw error;
    }
  }

  async getFollowers({userId, username, limit, offset}) {
    try {
      const user = await this.userRepo.findByUsername(username);
      if (!user) throw createError('User not found', 404);

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

  async followUser(followerId, username) {
    try {
      const targetUser = await this.userRepo.findByUsername(username);
      if (!targetUser) throw createError('User not found', 404);

      const followingId = targetUser.id;

      if (followerId === followingId) throw createError('You cannot follow yourself', 409);
      const isFollow = await this.followersRepo.findByFollowerIdAndFollowingId(
        followerId,
        followingId
      );
      if (isFollow) throw createError('You already following this profile', 409);

      const follower = await this.userRepo.findById(followerId)

      await addNotificationJob('new_follower',{
         followedUserId: followingId, 
         followerId: followerId, 
         followerName: follower.name, 
         followerUsername: follower.username
      })
      await this.followersRepo.createFolow(followerId, followingId);
      await this.userRepo.incrementFollowingCount(followerId);
      await this.userRepo.incrementFollowerCount(followingId);
    } catch (error) {
      throw error;
    }
  }

  async unfollowUser(followerId, username) {
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

  async removeFollower(followingId, username) {
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
