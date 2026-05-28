'use strict';

const { apiResponse } = require('../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../utils/pagination.util');

class CommunityController {
  constructor({ communityService }) {
    this.communitySvc = communityService;
  }

  browse = async (req, res, next) => {
    try {
      const { limit, offset, page } = getPaginationParams(req.query);
      const { communities, total } = await this.communitySvc.browse(req.query, limit, offset);
      res.json(apiResponse(communities, 'Communities fetched', paginationMeta(total, page, limit)));
    } catch (err) { next(err); }
  };

  create = async (req, res, next) => {
    try {
      const community = await this.communitySvc.create(req.userId, req.body);
      res.status(201).json(apiResponse(community, 'Community created'));
    } catch (err) { next(err); }
  };

  getBySlug = async (req, res, next) => {
    try {
      const community = await this.communitySvc.getBySlug(req.params.slug);
      res.json(apiResponse(community));
    } catch (err) { next(err); }
  };

  update = async (req, res, next) => {
    try {
      const community = await this.communitySvc.update(req.params.communityId, req.userId, req.userRole, req.body);
      res.json(apiResponse(community, 'Community updated'));
    } catch (err) { next(err); }
  };

  remove = async (req, res, next) => {
    try {
      await this.communitySvc.remove(req.params.communityId, req.userId, req.userRole);
      res.json(apiResponse(null, 'Community deleted'));
    } catch (err) { next(err); }
  };

  join = async (req, res, next) => {
    try {
      const { status, message } = await this.communitySvc.join(req.params.communityId, req.userId);
      res.json(apiResponse(null, message || (status === 'pending' ? 'Join request sent' : 'Joined community')));
    } catch (err) { next(err); }
  };

  leave = async (req, res, next) => {
    try {
      await this.communitySvc.leave(req.params.communityId, req.userId);
      res.json(apiResponse(null, 'Left community'));
    } catch (err) { next(err); }
  };

  getMembers = async (req, res, next) => {
    try {
      const { limit, offset, page } = getPaginationParams(req.query);
      const { rows, total } = await this.communitySvc.getMembers(req.params.communityId, limit, offset);
      res.json(apiResponse(rows, 'Members fetched', paginationMeta(total, page, limit)));
    } catch (err) { next(err); }
  };

  getCommunityPosts = async (req, res, next) => {
    try {
      const { limit, offset, page } = getPaginationParams(req.query);
      const { posts, total } = await this.communitySvc.getCommunityPosts(req.params.communityId, limit, offset);
      res.json(apiResponse(posts, 'Posts fetched', paginationMeta(total, page, limit)));
    } catch (err) { next(err); }
  };

  approveMember = async (req, res, next) => {
    try {
      await this.communitySvc.approveMember(req.params.communityId, req.params.userId, req.userId, req.userRole);
      res.json(apiResponse(null, 'Member approved'));
    } catch (err) { next(err); }
  };

  removeMember = async (req, res, next) => {
    try {
      await this.communitySvc.removeMember(req.params.communityId, req.params.userId);
      res.json(apiResponse(null, 'Member removed'));
    } catch (err) { next(err); }
  };
}

module.exports = CommunityController;
