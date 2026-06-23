'use strict';

const { apiResponse } = require('../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../utils/pagination.util');

class UserController {
  constructor({ userService }) {
    this.userSvc = userService;
  }

  getProfile = async (req, res, next) => {
    try {
      const { username } = req.params;
      const userId = req.userId || null;
      const user = await this.userSvc.getProfile({username, userId});
      res.json(apiResponse(user, "User fetched successfully"));
    } catch (error) {
      next(error);
    }
  };

  updateProfile = async (req, res, next) => {
    try {
      const userId = req.userId;
      const body = req.body;
      const updated = await this.userSvc.updateProfile({userId, body});
      res.json(apiResponse(updated, 'Profile updated successfully'));
    } catch (error) {
      next(error);
    }
  };

  updateAvatar = async (req, res, next) => {
    try {
      const userId = req.userId;
      const file = req.files;
      const updateAvatar = await this.userSvc.updateAvatar({userId, file});
      res.json(apiResponse(updateAvatar, 'Avatar updated successfully'));
    } catch (error) {
      next(error);
    }
  };

  updateBanner = async (req, res, next) => {
    try {
      const userId = req.userId;
      const file = req.files;
      const updateBanner = await this.userSvc.updateBanner({userId, file});
      res.json(apiResponse(updateBanner, 'Banner updated successfully'));
    } catch (error) {
      next(error);
    }
  };

  updateUsername = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { username } = req.body;
      const updated = await this.userSvc.updateUsername({userId, username});
      res.json(apiResponse(updated, 'Username updated successfully'));
    } catch (error) {
      next(error);
    }
  };

  updatePrivacy = async (req, res, next) => {
    try {
      const userId = req.userId
      const {privacy} = req.body
      await this.userSvc.updatePrivacy({userId, privacy});
      res.json(apiResponse(null, 'Privacy updated successfully'));
    } catch (error) {
      next(error)
    }
  }

  getFollowers = async (req, res, next) => {
    try {
      const { limit, offset, page } = getPaginationParams(req.query);
      const userId = req.userId;
      const { username } = req.params;
      const { followers, total } = await this.userSvc.getFollowers({userId, username, limit, offset});
      res.json(apiResponse(followers, 'Followers fetched successfully', paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  };

  getFollowing = async (req, res, next) => {
    try {
      const { limit, offset, page } = getPaginationParams(req.query);
      const userId = req.userId;
      const { username } = req.params;
      const { followings, total } = await this.userSvc.getFollowing({userId, username, limit, offset});
      res.json(apiResponse(followings, 'Followings fetched successfully', paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  };

  getbookmarked = async (req, res, next) => {
    try {
      const { limit, offset, page } = getPaginationParams(req.query);
      const userId = req.userId;
      console.log('req.user', req.userId);
      const {bookmark, total} = await this.userSvc.getbookmarked({userId, limit, offset});
      res.json(apiResponse(bookmark, 'Bookmarked fetched successfully', paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  }

  followUser = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { username } = req.params;
      const {message} = await this.userSvc.followUser({userId, username});
      res.status(201).json(apiResponse(null, message));
    } catch (error) {
      next(error);
    }
  };

  approveTofollow = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { followerId } = req.params;
      const {message} = await this.userSvc.approveTofollow({userId, followerId});
      res.status(201).json(apiResponse(null, message));
    } catch (error) {
      next(error)
    }
  }

  unfollowUser = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { username } = req.params;
      await this.userSvc.unfollowUser({userId, username});
      res.json(apiResponse(null, 'Unfollow successfully'));
    } catch (error) {
      next(error);
    }
  };

  removeFollower = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { username } = req.params;
      await this.userSvc.removeFollower({userId, username});
      res.json(apiResponse(null, 'Follower removed successfully'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = UserController;
