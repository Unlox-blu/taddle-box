'use strict';

const { createError } = require('../utils/error.util');
const CommunityModel = require('../models/community.model');
const PostModel = require('../models/post.model');
const { uploadFile } = require('../integrations/storage/cloudinary.service');

class CommunityService {
  constructor({ communityRepository, postRepository, notificationService}) {
    this.communityRepo = communityRepository;
    this.postRepo = postRepository;
    this.notifSvc = notificationService;
  }

  

  async create(ownerId, data) {
    try {
      const slug = data.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      const existing = await this.communityRepo.findBySlug(slug);
      if (existing) throw createError('A community with this name already exists', 409);

      const community = await this.communityRepo.create({ ...data, slug, ownerId });

      await this.communityRepo.addMember(community.id, ownerId, 'admin');
      await this.communityRepo.incrementMemberCount(community.id);
      return CommunityModel.format(community);
    } catch (error) {
      throw error;
    }
  }

  async getBySlug(slug) {
    try {
      const community = await this.communityRepo.findBySlug(slug);
      if (!community) throw createError('Community not found', 404);
      return CommunityModel.format(community);
    } catch (error) {
      throw error;
    }
  }

  async update(communityId, userId, userRole, data) {
    try {
      const community = await this.communityRepo.findById(communityId);
      if (!community) throw createError('Community not found', 404);

      const isOwner = community.owner_id === userId;
      const isAdmin = userRole === 'admin' || userRole === 'superadmin';
      if (!isOwner && !isAdmin) throw createError('Not authorized to update this community', 403);

      const updated = await this.communityRepo.update(communityId, data);
      return CommunityModel.format(updated);
    } catch (error) {
      throw error;
    }
  }

  async updateAvatar(communityId, userId, userRole, file) {
    try {
      if (!file || !file.avatar || !file.avatar.data) throw createError('No file provided', 400);

      const community = await this.communityRepo.findById(communityId);
      if (!community) throw createError('Community not found', 404);

      const isOwner = community.owner_id === userId;
      const isAdmin = userRole === 'admin' || userRole === 'superadmin';
      if (!isOwner && !isAdmin)
        throw createError('Not authorized to update this community avatar', 403);

      const {url} = await uploadFile(file.avatar.data, 'avatar', userId);

      const updatedAvatar = await this.communityRepo.updateAvatar(communityId, url);
      return updatedAvatar;
    } catch (error) {
      throw error;
    }
  }

  async updateBanner(communityId, userId, userRole, file) {
    try {
      if (!file || !file.banner || !file.banner.data) throw createError('No file provided', 400);

      const community = await this.communityRepo.findById(communityId);
      if (!community) throw createError('Community not found', 404);

      const isOwner = community.owner_id === userId;
      const isAdmin = userRole === 'admin' || userRole === 'superadmin';
      if (!isOwner && !isAdmin)
        throw createError('Not authorized to update this community banner', 403);

      const {url} = await uploadFile(file.banner.data, 'banner', userId);

      const updatedBanner = await this.communityRepo.updateBanner(communityId, url);
      return updatedBanner;
    } catch (error) {
      throw error;
    }
  }

  async remove(communityId, userId, userRole) {
    try {
      const community = await this.communityRepo.findById(communityId);
      if (!community) throw createError('Community not found', 404);

      if (community.owner_id !== userId && userRole !== 'superadmin') {
        throw createError('Only the owner can delete this community', 403);
      }

      await this.communityRepo.softDelete(communityId);
    } catch (error) {
      throw error;
    }
  }

  async join(communityId, userId) {
    try {
      const community = await this.communityRepo.findById(communityId);
      if (!community) throw createError('Community not found', 404);

      const alreadyMember = await this.communityRepo.isMember(communityId, userId);
      if (alreadyMember) throw createError('Already a member of this community', 409);

      const isPending = community.privacy === 'private';
      const status = isPending ? 'pending' : 'active';
      await this.communityRepo.addMember(communityId, userId, 'member', status);

      if(isPending){
        const admins = await this.communityRepo.getAdminsId(communityId)
        const type = 'Request'
        const title = 'Request to join community'
        const message = `${userId} is requesting to join the name: ${community.name}, communityId: ${communityId}`
         
        await Promise.all(admins.map(({user_id}) => {
          this.notifSvc.create({ recipientId: user_id, senderId: userId, type, title, message })
        })); 
      }

      if (!isPending) await this.communityRepo.incrementMemberCount(communityId);

      return { status };
    } catch (error) {
      throw error;
    }
  }

  async leave(communityId, userId) {
    try {
      const community = await this.communityRepo.findById(communityId);
      if (community?.owner_id === userId)
        throw createError('Owner cannot leave the community', 400);

      const isMember = await this.communityRepo.isMember(communityId, userId);
      if (!isMember) throw createError('Already not the member of this community', 403);

      await this.communityRepo.removeMember(communityId, userId);
      await this.communityRepo.decrementMemberCount(communityId);
    } catch (error) {
      throw error;
    }
  }

  async getMembers(communityId, userId, limit, offset) {
    try {
      const community = await this.communityRepo.findById(communityId);
      if (!community) throw createError('Community not found', 404);

      if (community.privacy === 'private') {
        const isMember = await this.communityRepo.isMember(communityId, userId);
        if (!isMember || isMember.status !== 'active')
          throw createError('You are not the member of this privet community', 403);
      }
      return this.communityRepo.getMembers(communityId, 'active', limit, offset);
    } catch (error) {
      throw error;
    }
  }

  async getCommunityPosts(communityId, userId, limit, offset) {
    try {
      const community = await this.communityRepo.findById(communityId);
      if (!community) throw createError('Community not found', 404);

      if (community.privacy === 'private') {
        const isMember = await this.communityRepo.isMember(communityId, userId);
        if (!isMember || isMember.status !== 'active')
          throw createError('You are not the member of this privet community', 403);
      }

      const { rows, total } = await this.postRepo.findManyByCommunity(communityId, limit, offset);
      return { posts: rows.map(PostModel.format), total };
    } catch (error) {
      throw error;
    }
  }

  async approveMember(communityId, targetUserId, requesterId, requesterRole) {
    try {
      const community = await this.communityRepo.findById(communityId);
      if (!community) throw createError('Community not found', 404);

      const member = await this.communityRepo.getMember(communityId, requesterId);
      const canApprove =
        member?.role === 'admin' ||
        ['admin', 'superadmin'].includes(requesterRole);

      if (!canApprove) throw createError('Not authorized to approve members', 403);

      const isMember = await this.communityRepo.isMember(communityId, targetUserId);
      if (!isMember) throw createError('Not request to be a member for this community', 409);

      if (isMember.status === 'active')
        throw createError('Already a member of this community', 409);

      await this.communityRepo.updateMemberStatus(communityId, targetUserId, 'active');
      await this.communityRepo.incrementMemberCount(communityId);

      const type = 'Approve'
      const title = 'Request approved to join community'
      const message = `Now you are the member of ${community.name} community.`
         
      await this.notifSvc.create({ recipientId: targetUserId, senderId: requesterId, type, title, message })
        
    } catch (error) {
      throw error;
    }
  }

  async removeMember(communityId, targetUserId, requesterId, requesterRole) {
    try {
      const community = await this.communityRepo.findById(communityId);
      if (!community) throw createError('Community not found', 404);

      const member = await this.communityRepo.getMember(communityId, requesterId);
      const canApprove =
        member?.role === 'admin' ||
        member?.role === 'moderator' ||
        ['admin', 'superadmin'].includes(requesterRole);
      if (!canApprove) throw createError('Not authorized to approve members', 403);

      const notMember = await this.communityRepo.isMember(communityId, targetUserId);
      if (!notMember) throw createError('Already not a member of this community', 409);

      await this.communityRepo.removeMember(communityId, targetUserId);
      await this.communityRepo.decrementMemberCount(communityId);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = CommunityService;
