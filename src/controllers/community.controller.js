'use strict';

const { apiResponse } = require('../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../utils/pagination.util');

class CommunityController {
  constructor({ communityService }) {
    this.communitySvc = communityService;
  }

  create = async (req, res, next) => {
    try {
      const userId = req.userId;
      const body = req.body;
      const community = await this.communitySvc.create({userId, body});
      res.status(201).json(apiResponse(community, 'Community created'));
    } catch (error) {
      next(error);
    }
  };

  getBySlug = async (req, res, next) => {
    try {
      const { slug } = req.params;
      const community = await this.communitySvc.getBySlug({slug});
      res.json(apiResponse(community, 'Community fetched successfully'));
    } catch (error) {
      next(error);
    }
  };

  update = async (req, res, next) => {
    try {
      const { communityId } = req.params;
      const userId = req.userId;
      const userRole = req.userRole;
      const body = req.body;
      const community = await this.communitySvc.update({communityId, userId, userRole, body});
      res.json(apiResponse(community, 'Community updated successfully'));
    } catch (error) {
      next(error);
    }
  };

  updateAvatar = async (req, res, next) => {
    try {
      const { communityId } = req.params;
      const userId = req.userId;
      const userRole = req.userRole;
      const {avatarUrl} = req.body;
      const community = await this.communitySvc.updateAvatar({communityId, userId, userRole, avatarUrl});
      res.json(apiResponse(community, 'Community avatar updated successfully'));
    } catch (error) {
      next(error);
    }
  };

  updateBanner = async (req, res, next) => {
    try {
      const { communityId } = req.params;
      const userId = req.userId;
      const userRole = req.userRole;
      const {bannerUrl} = req.body;
      const community = await this.communitySvc.updateBanner({communityId, userId, userRole, bannerUrl});
      res.json(apiResponse(community, 'Community banner updated successfully'));
    } catch (error) {
      next(error);
    }
  };

  remove = async (req, res, next) => {
    try {
      const { communityId } = req.params;
      const userId = req.userId;
      const userRole = req.userRole;
      await this.communitySvc.remove({communityId, userId, userRole});
      res.json(apiResponse(null, 'Community deleted successfully'));
    } catch (error) {
      next(error);
    }
  };

  join = async (req, res, next) => {
    try {
      const { communityId } = req.params;
      const userId = req.userId;
      const { status, message } = await this.communitySvc.join({communityId, userId});
      res.json(
        apiResponse(
          null,
          message || (status === 'pending' ? 'Join request sent' : 'Joined community')
        )
      );
    } catch (error) {
      next(error);
    }
  };

  leave = async (req, res, next) => {
    try {
      const { communityId } = req.params;
      const userId = req.userId;
      await this.communitySvc.leave({communityId, userId});
      res.json(apiResponse(null, 'Left community'));
    } catch (error) {
      next(error);
    }
  };

  getMembers = async (req, res, next) => {
    try {
      const { communityId } = req.params;
      const userId = req.userId;
      const { limit, offset, page } = getPaginationParams(req.query);
      const { rows, total } = await this.communitySvc.getMembers({ communityId, userId, limit, offset });
      res.json(apiResponse(rows, 'Members fetched', paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  };

  getCommunityPosts = async (req, res, next) => {
    try {
      const { communityId } = req.params;
      const userId = req.userId;
      const { limit, offset, page } = getPaginationParams(req.query);
      const { posts, total } = await this.communitySvc.getCommunityPosts( {communityId, userId, limit, offset} );
      res.json(apiResponse(posts, 'Posts fetched', paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  };

  approveMember = async (req, res, next) => {
    try {
      const { communityId, userId: targetUserId } = req.params;
      const userId = req.userId;
      const userRole = req.userRole;
      await this.communitySvc.approveMember({communityId, targetUserId, userId, userRole});
      res.json(apiResponse(null, 'Member approved'));
    } catch (error) {
      next(error);
    }
  };

  removeMember = async (req, res, next) => {
    try {
      const { communityId, userId: targetUserId } = req.params;
      const userId = req.userId;
      const userRole = req.userRole;
      await this.communitySvc.removeMember({communityId, targetUserId, userId, userRole});
      res.json(apiResponse(null, 'Member removed'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = CommunityController;
