'use strict';

const { apiResponse } = require('../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../utils/pagination.util');

class UserController {
  constructor({ userService }) {
    this.userSvc = userService;
  }

  searchUsers = async (req, res, next) => {
    try {
      const query = req.query.q
      const { limit, offset, page } = getPaginationParams(req.query);
      const users = await this.userSvc.searchUsers(query, limit, offset);
      res.json(apiResponse(users, 'Users found'));
    } catch (err) { next(err); }
  };

  getProfile = async (req, res, next) => {
    try {
      const {username} = req.params
      const userId = req.userId
      const user = await this.userSvc.getProfile(username, userId);
      res.json(apiResponse(user));
    } catch (err) { 
      next(err); 
    }
  };

  updateProfile = async (req, res, next) => {
    try {
      const userId = req.userId
      const fields = req.body
      const updated = await this.userSvc.updateProfile(userId, fields);
      res.json(apiResponse({updated}, 'Profile updated'));
    } catch (err) { 
      next(err); 
    }
  };

  updateAvatar = async (req, res, next) => {
    try {
      const userId = req.userId
      const files = req.files
      const updateAvatar = await this.userSvc.updateAvatar(userId, files);
      res.json(apiResponse(updateAvatar, 'Avatar updated'));
    } catch (err) { next(err); }
  };

  updateBanner = async (req, res, next) => {
    try {
      const userId = req.userId
      const files = req.files
      const updateBanner = await this.userSvc.updateBanner(userId, files);
      res.json(apiResponse(updateBanner, 'Banner updated'));
    } catch (err) { next(err); }
  };

  updateUsername = async (req, res, next) => {
    try {
      const updated = await this.userSvc.updateUsername(req.userId, req.body.username);
      res.json(
        apiResponse(updated, 'Username updated')
      );
    } catch (err) { 
      next(err); 
    }
  };

  getFollowers = async (req, res, next) => {
    try {
      const { limit, offset, page } = getPaginationParams(req.query);
      const userId = req.userId
      const {username} = req.params
      const data = await this.userSvc.getFollowers(userId, username, limit, offset);
      res.json(
        apiResponse(data, 'Followers fetched')
      );
    } catch (err) { 
      next(err); 
    }
  };

  getFollowing = async (req, res, next) => {
    try {
      const { limit, offset, page } = getPaginationParams(req.query);
      const userId = req.userId
      const {username} = req.params
      const data = await this.userSvc.getFollowing(userId, username, limit, offset);
      res.json(
        apiResponse(data, 'Followings fetched')
      );
    } catch (err) { 
      next(err); 
    }
  };

  followUser = async (req, res, next) => {
    try {
      const userId = req.userId
      const {username} = req.params
      await this.userSvc.followUser(userId, username);
      res.json(apiResponse(null, 'Followed successfully'));
    } catch (err) { next(err); }
  };

  unfollowUser = async (req, res, next) => {
    try {
      const userId = req.userId
      const {username} = req.params
      await this.userSvc.unfollowUser(userId, username);
      res.json(apiResponse(null, 'Unfollowed successfully'));
    } catch (err) { next(err); }
  };

  removeFollower = async (req, res, next) => {
    try {
      const userId = req.userId
      const {username} = req.params
      await this.userSvc.removeFollower(userId, username);
      res.json(apiResponse(null, 'Follower removed successfully'));
    } catch (error) {
      next(error)
    }
  }
}

module.exports = UserController;
