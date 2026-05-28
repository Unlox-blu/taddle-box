'use strict';

const { createError } = require('../utils/error.util');
const CommunityModel = require('../models/community.model');
const PostModel = require('../models/post.model');

class CommunityService {
  constructor({ communityRepository, postRepository }) {
    this.communityRepo = communityRepository;
    this.postRepo = postRepository;
  }

  async browse(filters, limit, offset) {
    const { rows, total } = await this.communityRepo.browse(filters, limit, offset);
    return { communities: rows.map(CommunityModel.format), total };
  }

  async create(ownerId, data) {
    const slug = data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const existing = await this.communityRepo.findBySlug(slug);
    if (existing) throw createError('A community with this name already exists', 409);

    const community = await this.communityRepo.create({ ...data, slug, ownerId });
    // Auto-add creator as admin
    await this.communityRepo.addMember(community.id, ownerId, 'admin');
    await this.communityRepo.incrementMemberCount(community.id);
    return CommunityModel.format(community);
  }

  async getBySlug(slug) {
    const community = await this.communityRepo.findBySlug(slug);
    if (!community) throw createError('Community not found', 404);
    return CommunityModel.format(community);
  }

  async update(communityId, userId, userRole, data) {
    const community = await this.communityRepo.findById(communityId);
    if (!community) throw createError('Community not found', 404);
    const isOwner = community.owner_id === userId;
    const isAdmin = userRole === 'admin' || userRole === 'superadmin';
    if (!isOwner && !isAdmin) throw createError('Not authorized to update this community', 403);
    const updated = await this.communityRepo.update(communityId, data);
    return CommunityModel.format(updated);
  }

  async remove(communityId, userId, userRole) {
    const community = await this.communityRepo.findById(communityId);
    if (!community) throw createError('Community not found', 404);
    if (community.owner_id !== userId && userRole !== 'superadmin') {
      throw createError('Only the owner can delete this community', 403);
    }
    await this.communityRepo.softDelete(communityId);
  }

  async join(communityId, userId) {
    const community = await this.communityRepo.findById(communityId);
    if (!community) throw createError('Community not found', 404);
    const alreadyMember = await this.communityRepo.isMember(communityId, userId);
    if (alreadyMember) throw createError('Already a member of this community', 409);

    const isPending = community.privacy === 'private';
    const status = isPending ? 'pending' : 'active';
    await this.communityRepo.addMember(communityId, userId, 'member', status);
    if (!isPending) await this.communityRepo.incrementMemberCount(communityId);
    return { status };
  }

  async leave(communityId, userId) {
    const community = await this.communityRepo.findById(communityId);
    if (community?.owner_id === userId) throw createError('Owner cannot leave the community', 400);
    await this.communityRepo.removeMember(communityId, userId);
    await this.communityRepo.decrementMemberCount(communityId);
  }

  async getMembers(communityId, limit, offset) {
    return this.communityRepo.getMembers(communityId, 'active', limit, offset);
  }

  async getCommunityPosts(communityId, limit, offset) {
    const { rows, total } = await this.postRepo.findManyByCommunity(communityId, limit, offset);
    return { posts: rows.map(PostModel.format), total };
  }

  async approveMember(communityId, targetUserId, requesterId, requesterRole) {
    const member = await this.communityRepo.getMember(communityId, requesterId);
    const canApprove = member?.role === 'admin' || member?.role === 'moderator'
      || ['admin', 'superadmin'].includes(requesterRole);
    if (!canApprove) throw createError('Not authorized to approve members', 403);
    await this.communityRepo.updateMemberStatus(communityId, targetUserId, 'active');
    await this.communityRepo.incrementMemberCount(communityId);
  }

  async removeMember(communityId, targetUserId) {
    await this.communityRepo.removeMember(communityId, targetUserId);
    await this.communityRepo.decrementMemberCount(communityId);
  }
}

module.exports = CommunityService;
