'use strict';

const { createError } = require('../utils/error.util');
const UserModel = require('../models/user.model');
const FollowersModel = require('../models/followers.model');
const { uploadToCloudinary } = require('../config/cloudinary');
const { tryCatch } = require('bullmq');

class UserService {
  constructor({ userRepository, storageIntegration, followerRepository}) {
    this.userRepo = userRepository;
    this.followersRepo = followerRepository;
    this.storageSvc = storageIntegration;
  }

  async searchUsers(query, limit, offset) {
    const users = await this.userRepo.search(query || '', limit, offset);
    return users.map(UserModel.format);
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
    if (!file) throw createError('No file provided', 400);

    const fileUrl = await uploadToCloudinary(file.avatar.data);

    const updateAvatar = await this.userRepo.updateAvatar(userId, fileUrl);
    return updateAvatar;
  }

  async updateUsername(userId, username) {
    const existing = await this.userRepo.findByUsername(username);
    if (existing && existing.id !== userId) throw createError('Username is already taken', 409);
    const updated = await this.userRepo.updateUsername(userId, username);
    return UserModel.format(updated);
  }

  async getFollowers(userId, username, limit, offset) {
    try {
      const user = await this.userRepo.findByUsername(username)
      if(!user) throw createError("User not found", 404)

      const {followings, total} = await this.followersRepo.findByFollowingId(user.id, limit, offset)
      const followers = followings.length ? followings.map(FollowersModel.format) : []
      return { followers, total }

    } catch (error) {
      throw error
    }
  }

  async getFollowing(userId, username, limit, offset) {
    try {
      const user = await this.userRepo.findByUsername(username)
      if(!user) throw createError("User not found", 404)

      const {followers, total} = await this.followersRepo.findByFollowerId(user.id, limit, offset)
      const followings = followers.length ? followers.map(FollowersModel.format) : []
      return { followings, total }

    } catch (error) {
      throw error
    }
  }

  async followUser(followerId, username) {
    try {
      const targetUser = await this.userRepo.findByUsername(username)
      if(!targetUser) throw createError("User not found", 404)

      const followingId = targetUser.id 

      if (followerId === followingId) throw createError('You cannot follow yourself', 400);
      const isFollow = await this.followersRepo.findByFollowerIdAndFollowingId(followerId, followingId)
      if(isFollow) throw createError('You already following this profile', 400);

      await this.followersRepo.createFolow(followerId, followingId)
      await this.userRepo.incrementFollowingCount(followerId);
      await this.userRepo.incrementFollowerCount(followingId);
    } catch (error) {
      throw error
    }
  }

  async unfollowUser(followerId, username) {
    try {
      const targetUser = await this.userRepo.findByUsername(username)
      if(!targetUser) throw createError("User not found", 404)

      const followingId = targetUser.id 

      if (followerId === followingId) throw createError('You cannot unFollow yourself', 400);

      const isFollow = await this.followersRepo.findByFollowerIdAndFollowingId(followerId, followingId)
      if(!isFollow) throw createError('You are not following this profile', 400);

      await this.followersRepo.hardDelete(followerId, followingId)

      await this.userRepo.decrementFollowingCount(followerId);
      await this.userRepo.decrementFollowerCount(followingId);
    } catch (error) {
      throw error
    }
  }

 
}

module.exports = UserService;
