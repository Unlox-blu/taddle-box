'use strict';

const { createError } = require('../../utils/error.util');
const CommunityModel = require('./community.model');
const PostModel = require('../post/post.model');
const { uploadFile } = require('../../integrations/storage/cloudinary.service');
const { addNotificationJob } = require('../../jobs/queues/notification.queue');
const { addJob } = require('../../jobs/queues/job.queue');

class CommunityService {
  constructor({ communityRepository, postRepository, userRepository, mediaService}) {
    this.communityRepo = communityRepository;
    this.postRepo = postRepository;
    this.userRepo = userRepository;
    this.mediaSvc = mediaService;
  }

  async create({userId: ownerId, body: data}) {
    try {
      const slug = data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

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

  async getBySlug({slug}) {
    try {
      const community = await this.communityRepo.findBySlug(slug);
      if (!community) throw createError('Community not found', 404);
      return CommunityModel.format(community);
    } catch (error) {
      throw error;
    }
  }

  async update({communityId, userId, userRole, body: data}) {
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

  async updateAvatar({communityId, userId, userRole, avatarMediaId}) {
    try {
      const community = await this.communityRepo.findAvatarAndBanner(communityId)

      if(community.avatarMediaId){
        this.mediaSvc.clearS3Storage({userId, mediaId: community.avatarMediaId})
      }

      const updatedAvatar = await this.communityRepo.updateAvatar(communityId, avatarMediaId);
      return updatedAvatar;
    } catch (error) {
      throw error;
    }
  }

  async updateBanner({communityId, userId, userRole, bannerMediaId}) {
    try {
      const community = await this.communityRepo.findAvatarAndBanner(communityId)

      if(community.bannerMediaId){
        this.mediaSvc.clearS3Storage({userId, mediaId: community.bannerMediaId})
      }
      const updatedBanner = await this.communityRepo.updateBanner(communityId, bannerMediaId);
      return updatedBanner;
    } catch (error) {
      throw error;
    }
  }

  async remove({communityId, userId, userRole}) {
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

  async join({communityId, userId}) {
    try {
      const community = await this.communityRepo.findById(communityId);
      if (!community) throw createError('Community not found', 404);
      
      const alreadyMember = await this.communityRepo.isMember(communityId, userId);
      if (alreadyMember) throw createError('Already a member of this community', 409);
      
      const isPending = community.privacy === 'private';
      const status = isPending ? 'pending' : 'active';
      await this.communityRepo.addMember(communityId, userId, 'member', status);
      
      const user = await this.userRepo.findById(userId)
      const admins = await this.communityRepo.getAdminsId(communityId)
      const adminsId = admins.map( e => e.user_id)
      
      const jobdata = {
        communityId: communityId, 
        userId: userId, 
        userName: user.name, 
        userUsername: user.username, 
        adminsId: adminsId
      }
      
      if(isPending){
        await addJob('notification:request_to_join_community', jobdata)
      }else {
        await this.communityRepo.incrementMemberCount(communityId);
        await addJob('notification:new_member_join_community', jobdata)
      }

      return { status };
    } catch (error) {
      throw error;
    }
  }

  async leave({communityId, userId}) {
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

  async getMembers({communityId, userId, limit, offset}) {
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

  async getCommunityPosts({communityId, userId, limit, offset}) {
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

  async approveMember({communityId, targetUserId, userId: approvalId, userRole: approvalRole}) {
    try {
      const community = await this.communityRepo.findById(communityId);
      if (!community) throw createError('Community not found', 404);

      const member = await this.communityRepo.getMember(communityId, approvalId);
      const canApprove = member?.role === 'admin' || ['admin', 'superadmin'].includes(approvalRole);

      if (!canApprove) throw createError('Not authorized to approve members', 403);

      const isMember = await this.communityRepo.isMember(communityId, targetUserId);
      if (!isMember) throw createError('Not request to be a member for this community', 409);

      if (isMember.status === 'active')
        throw createError('Already a member of this community', 409);

      await this.communityRepo.updateMemberStatus(communityId, targetUserId, 'active');
      await this.communityRepo.incrementMemberCount(communityId);

      const user = await this.userRepo.findById(targetUserId)
      
      const jobdata = {
        communityId: communityId, 
        userId: user.id, 
        userName: user.name, 
        userUsername: user.username, 
        approvalId: approvalId
      }
      
      await addJob('notification:approved_to_join_community', jobdata)
    } catch (error) {
      throw error;
    }
  }

  async removeMember({communityId, targetUserId, userId: approvalId, userRole: approvalRole}) {
    try {
      const community = await this.communityRepo.findById(communityId);
      if (!community) throw createError('Community not found', 404);

      const member = await this.communityRepo.getMember(communityId, approvalId);
      const canApprove =
        member?.role === 'admin' ||
        member?.role === 'moderator' ||
        ['admin', 'superadmin'].includes(approvalRole);
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
