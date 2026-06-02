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
    } catch (err) { next(err); }
  };

  updateProfile = async (req, res, next) => {
    try {
      const updated = await this.userSvc.updateProfile(req.userId, req.body);
      res.json(apiResponse({updated}, 'Profile updated'));
    } catch (err) { next(err); }
  };

  updateAvatar = async (req, res, next) => {
    try {
      const userId = req.userId
      const files = req.files
      const updateAvatar = await this.userSvc.updateAvatar(userId, files);
      res.json(apiResponse(updateAvatar, 'Avatar updated'));
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
      const data = await this.userSvc.getFollowers(userId, limit, offset);
      res.json(apiResponse(data, 'Followers fetched'));
    } catch (err) { 
      next(err); 
    }
  };

  getFollowing = async (req, res, next) => {
    try {
      const { limit, offset } = getPaginationParams(req.query);
      const data = await this.userSvc.getFollowing(req.params.userId, limit, offset);
      res.json(apiResponse(data, 'Following fetched'));
    } catch (err) { next(err); }
  };

  followUser = async (req, res, next) => {
    try {
      await this.userSvc.followUser(req.userId, req.params.userId);
      res.json(apiResponse(null, 'Followed successfully'));
    } catch (err) { next(err); }
  };

  unfollowUser = async (req, res, next) => {
    try {
      await this.userSvc.unfollowUser(req.userId, req.params.userId);
      res.json(apiResponse(null, 'Unfollowed successfully'));
    } catch (err) { next(err); }
  };
}

module.exports = UserController;
