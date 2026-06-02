'use strict';

const { createError } = require('../utils/error.util');
const UserModel = require('../models/user.model');
const { uploadToCloudinary } = require('../config/cloudinary');

class UserService {
  constructor({ userRepository, storageIntegration }) {
    this.userRepo = userRepository;
    this.storageSvc = storageIntegration;
  }

  async searchUsers(query, limit, offset) {
    const users = await this.userRepo.search(query || '', limit, offset);
    return users.map(UserModel.format);
  }

  async getProfile(username, requesterId = null) {
    const user = await this.userRepo.findByUsername(username);
    if (!user) throw createError('User not found', 404);
    // Return sanitized private fields if viewing own profile
    if (requesterId && requesterId === user.id) {
      const privateUser = await this.userRepo.findByIdPrivate(user.id);
      return UserModel.format(privateUser);
    }
    return UserModel.format(user);
  }

  async updateProfile(userId, fields) {
    try {
      const updated = await this.userRepo.updateProfile(userId, fields);
      return UserModel.format(updated);
    } catch (error) {
      throw error
    }
  }

  async updateAvatar(userId, file) {

    if (!file) throw createError('No file provided', 400);

    const fileUrl = await uploadToCloudinary(file.avatar.data)

    const updateAvatar = await this.userRepo.updateAvatar(userId, fileUrl)
    return updateAvatar
  }

  async updateUsername(userId, username) {
    const existing = await this.userRepo.findByUsername(username);
    if (existing && existing.id !== userId) throw createError('Username is already taken', 409);
    const updated = await this.userRepo.updateUsername(userId, username);
    return UserModel.format(updated);
  }

  // async followUser(followerId, targetUserId) {
  //   if (followerId === targetUserId) throw createError('You cannot follow yourself', 400);
  //   const target = await this.userRepo.findById(targetUserId);
  //   if (!target) throw createError('User not found', 404);
  //   // TODO: add follow(followerId, targetUserId) to user.repository.js
  //   await this.userRepo.incrementFollowingCount(followerId);
  //   await this.userRepo.incrementFollowerCount(targetUserId);
  // }

  // async unfollowUser(followerId, targetUserId) {
  //   // TODO: add unfollow(followerId, targetUserId) to user.repository.js
  //   await this.userRepo.decrementFollowingCount(followerId);
  //   await this.userRepo.decrementFollowerCount(targetUserId);
  // }

  // async getFollowers(userId, limit, offset) {
  //   // TODO: add getFollowers(userId, limit, offset) to user.repository.js
  //   return [];
  // }

  // async getFollowing(userId, limit, offset) {
  //   // TODO: add getFollowing(userId, limit, offset) to user.repository.js
  //   return [];
  // }
}

module.exports = UserService;
