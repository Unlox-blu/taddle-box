'use strict';

const { apiResponse } = require('../../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../../utils/pagination.util');

class CommunityController {
  constructor({ communityService }) {
    this.communitySvc = communityService;
  }

  getCategories = async (req, res, next) => {
    try {
      const categories = ["Tech", "Gaming", "Lifestyle", "Startup", "Creative", "Study", "Others"];
      res.json(apiResponse(categories, 'Categories fetched successfully'));
    } catch (error) {
      next(error);
    }
  };

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
      const userId = req.userId;
      const community = await this.communitySvc.getBySlug({slug, userId});
      res.json(apiResponse(community, 'Community fetched successfully'));
    } catch (error) {
      next(error);
    }
  };

  discoverCommunity = async (req, res, next) => {
    try {
      const userId = req.userId
      const { limit, offset, page } = getPaginationParams(req.query);
      const search = req.query.search ? String(req.query.search).trim() : null;
      const category = req.query.category ? String(req.query.category).trim() : null;
      const filter = req.query.filter ? String(req.query.filter).trim() : null;
      const mine = req.query.mine === 'true' || req.query.mine === '1';

      const {communities, sections, total} = await this.communitySvc.discoverCommunity({userId, limit, offset, search, mine, category, filter});
      // sections rides alongside the paginated flat list — the client splits
      // the list by its own rules but renders in the server-provided order.
      res.json({...apiResponse(communities, 'Community fetched successfully', paginationMeta(total, page, limit)), sections});
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
      const {avatarMediaId} = req.body;
      const community = await this.communitySvc.updateAvatar({communityId, userId, userRole, avatarMediaId});
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
      const {bannerMediaId} = req.body;
      const community = await this.communitySvc.updateBanner({communityId, userId, userRole, bannerMediaId});
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
      const { search } = req.query;
      const { limit, offset, page } = getPaginationParams(req.query);
      const { rows, total, ownerId, viewerRole } = await this.communitySvc.getMembers({ communityId, userId, limit, offset, search });
      // ownerId + viewerRole ride alongside so the app can show the right
      // per-member actions (make/remove admin, transfer ownership, kick).
      res.json({ ...apiResponse(rows, 'Members fetched', paginationMeta(total, page, limit)), ownerId, viewerRole });
    } catch (error) {
      next(error);
    }
  };

  updateMemberRole = async (req, res, next) => {
    try {
      const { communityId, userId: targetUserId } = req.params;
      const { role } = req.body;
      const result = await this.communitySvc.updateMemberRole({
        communityId,
        targetUserId,
        userId: req.userId,
        role,
      });
      res.json(apiResponse(result, 'Member role updated'));
    } catch (error) {
      next(error);
    }
  };

  transferOwnership = async (req, res, next) => {
    try {
      const { communityId } = req.params;
      const { userId: targetUserId } = req.body;
      const community = await this.communitySvc.transferOwnership({
        communityId,
        userId: req.userId,
        targetUserId,
      });
      res.json(apiResponse(community, 'Ownership transferred'));
    } catch (error) {
      next(error);
    }
  };

  getRequests = async (req, res, next) => {
    try {
      const { communityId } = req.params;
      const userId = req.userId;
      const { limit, offset, page } = getPaginationParams(req.query);
      const { rows, total } = await this.communitySvc.getJoinRequests({ communityId, userId, limit, offset });
      res.json(apiResponse(rows, 'Join requests fetched', paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  };

  getCommunityPosts = async (req, res, next) => {
    try {
      const { communityId } = req.params;
      const userId = req.userId;
      const { limit, offset, page } = getPaginationParams(req.query);
      const useCursor = !!req.query.cursor;
      const { posts, total } = await this.communitySvc.getCommunityPosts( {communityId, userId, limit, offset} );
      const { envelopeItem } = require('../../utils/envelope.util');
      res.json({
        success: true,
        message: 'Posts fetched',
        data: {
          items: posts.map(p => envelopeItem('post', p)),
          pagination: paginationMeta(total, page, limit, useCursor)
        }
      });
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

  getModerationLog = async (req, res, next) => {
    try {
      const { communityId } = req.params;
      const userId = req.userId;
      const { limit, offset, page } = getPaginationParams(req.query);
      const { rows, total } = await this.communitySvc.getModerationLog({ communityId, userId, limit, offset });
      res.json(apiResponse(rows, 'Moderation log fetched', paginationMeta(total, page, limit)));
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
