'use strict';

const { apiResponse } = require('../../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../../utils/pagination.util');

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
      const {avatarMediaId} = req.body;
      const updateAvatar = await this.userSvc.updateAvatar({userId, avatarMediaId});
      res.json(apiResponse(updateAvatar, 'Avatar updated successfully'));
    } catch (error) {
      next(error);
    }
  };

  updateBanner = async (req, res, next) => {
    try {
      const userId = req.userId;
      const {bannerMediaId} = req.body;
      const updateBanner = await this.userSvc.updateBanner({userId, bannerMediaId});
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

  recordLocation = async (req, res, next) => {
    try {
      const userId = req.userId;
      const result = await this.userSvc.recordLocation({ userId, body: req.body });
      res.json(apiResponse(result, 'Location captured'));
    } catch (error) {
      next(error);
    }
  };

  clearLocation = async (req, res, next) => {
    try {
      const userId = req.userId;
      const result = await this.userSvc.clearLocationHistory({ userId });
      res.json(apiResponse(result, 'Location data cleared'));
    } catch (error) {
      next(error);
    }
  };

  updatePrivacy = async (req, res, next) => {
    try {
      const userId = req.userId
      const {privacy} = req.body
      const result = await this.userSvc.updatePrivacy({userId, privacy});
      res.json(apiResponse(result, 'Privacy updated successfully'));
    } catch (error) {
      next(error)
    }
  }

  getMutuals = async (req, res, next) => {
    try {
      const { limit, offset, page } = getPaginationParams(req.query);
      const { search } = req.query;
      const viewerId = req.userId;
      const { username } = req.params;
      const { users, total } = await this.userSvc.getMutuals({ viewerId, username, limit, offset, search });
      res.json(apiResponse(users, 'Mutuals fetched successfully', paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  };

  getFollowers = async (req, res, next) => {
    try {
      const { limit, offset, page } = getPaginationParams(req.query);
      const { search } = req.query;
      const userId = req.userId;
      const { username } = req.params;
      const { followers, total } = await this.userSvc.getFollowers({userId, username, limit, offset, search});
      res.json(apiResponse(followers, 'Followers fetched successfully', paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  };

  getFollowing = async (req, res, next) => {
    try {
      const { limit, offset, page } = getPaginationParams(req.query);
      const { search } = req.query;
      const userId = req.userId;
      const { username } = req.params;
      const { followings, total } = await this.userSvc.getFollowing({userId, username, limit, offset, search});
      res.json(apiResponse(followings, 'Followings fetched successfully', paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  };

  getbookmarked = async (req, res, next) => {
    try {
      const { limit, offset, page } = getPaginationParams(req.query);
      const userId = req.userId;
      const {bookmark, total} = await this.userSvc.getbookmarked({userId, limit, offset});
      res.json(apiResponse(bookmark, 'Bookmarked fetched successfully', paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  }

  getsaved = async (req, res, next) => {
    try {
      const { limit, offset, page } = getPaginationParams(req.query);
      const userId = req.userId;
      const {saved, total} = await this.userSvc.getsaved({userId, limit, offset});
      res.json(apiResponse(saved, 'Saved fetched successfully', paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  }

  getFollowRequests = async (req, res, next) => {
    try {
      const { limit, offset, page } = getPaginationParams(req.query);
      const userId = req.userId;
      const { requests, total } = await this.userSvc.getFollowRequests({userId, limit, offset});
      res.json(apiResponse(requests, 'Follow requests fetched successfully', paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  };

  rejectFollowRequest = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { followerId } = req.params;
      const { message } = await this.userSvc.rejectFollowRequest({userId, followerId});
      res.json(apiResponse(null, message));
    } catch (error) {
      next(error);
    }
  };

  acceptAllFollowRequests = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { message, accepted } = await this.userSvc.acceptAllFollowRequests({userId});
      res.json(apiResponse({ accepted }, message));
    } catch (error) {
      next(error);
    }
  };

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

  deleteAccount = async (req, res, next) => {
    try {
      const userId = req.userId;
      const result = await this.userSvc.deleteAccount(userId);
      res.json(apiResponse(null, result.message));
    } catch (error) {
      next(error);
    }
  };
  setupAppLock = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { pin, enableGlobal } = req.body;
      const result = await this.userSvc.setupAppLock({ userId, pin, enableGlobal });
      res.json(apiResponse(result, 'PIN setup successfully'));
    } catch (error) {
      next(error);
    }
  };

  verifyAppLock = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { pin } = req.body;
      const result = await this.userSvc.verifyAppLock({ userId, pin });
      res.json(apiResponse(result, 'PIN verified'));
    } catch (error) {
      next(error);
    }
  };

  resetAppLock = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { password, newPin } = req.body;
      const result = await this.userSvc.resetAppLock({ userId, password, newPin });
      res.json(apiResponse(result, 'PIN reset successfully'));
    } catch (error) {
      next(error);
    }
  };

  toggleAppLock = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { pin, isEnabled } = req.body;
      const result = await this.userSvc.toggleAppLockEnabled({ userId, pin, isEnabled });
      res.json(apiResponse(result, `Global App Lock ${isEnabled ? 'enabled' : 'disabled'}`));
    } catch (error) {
      next(error);
    }
  };

  removeAppLock = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { pin } = req.body;
      const result = await this.userSvc.removeAppLock({ userId, pin });
      res.json(apiResponse(result, 'PIN removed successfully'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = UserController;
