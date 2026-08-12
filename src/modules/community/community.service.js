'use strict';

const { createError } = require('../../utils/error.util');
const PostModel = require('../post/post.model');
const { notificationService } = require('../notification/notification.container');

class CommunityService {
  constructor({ communityRepository, postService, userRepository, mediaService, xpService}) {
    this.communityRepo = communityRepository;
    this.postSvc = postService;
    this.userRepo = userRepository;
    this.mediaSvc = mediaService;
    this.xpSvc = xpService || null;
  }

  async create({userId: ownerId, body: data}) {
    try {
      // Keep underscores (names are username-style now: letters/numbers/_ only).
      const slug = data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');

      const existing = await this.communityRepo.findBySlug(slug);
      if (existing) throw createError("A community with this name already exists", 409);

      const community = await this.communityRepo.create({ ...data, slug, ownerId });

      await this.communityRepo.addMember(community.id, ownerId, 'admin');
      await this.communityRepo.incrementMemberCount(community.id);
      return community;
    } catch (error) {
      throw error;
    }
  }

  async getBySlug({slug, userId}) {
    try {
      const community = await this.communityRepo.findBySlug(slug, userId);
      if (!community) throw createError('Community not found', 404);
      return community;
    } catch (error) {
      throw error;
    }
  }

  async discoverCommunity({userId, limit, offset, search, mine, category, filter}) {
    try {
      const {communities, total} = await this.communityRepo.findManyCommunity({limit, offset, userId, search, mine, category, filter});

      // Ordered section descriptor — the app renders the community tab's
      // sections in EXACTLY this order (the server owns the layout). Each
      // entry names a section the client already derives from the flat list
      // (trending = top by engagement, created = owned by me, joined =
      // membership, discover = everything else); the server only decides the
      // ORDER and TITLES, so reordering never needs a client release.
      const sections = [
        { type: 'trending', title: 'Trending' },
        { type: 'created', title: 'Created by You' },
        { type: 'joined', title: 'Your Communities' },
        { type: 'discover', title: 'Discover' },
      ];

      return {communities, total, sections};
    } catch (error) {
      throw error;
    }
  }

  async update({communityId, userId, userRole, body: data}) {
    try {
      const community = await this.communityRepo.findById(communityId);
      if (!community) throw createError('Community not found', 404);

      const isOwner = community.ownerId === userId;
      const isAdmin = userRole === 'admin' || userRole === 'superadmin';
      if (!isOwner && !isAdmin) throw createError("You do not have permission to update this community", 403);

      const updated = await this.communityRepo.update(communityId, data);
      return updated;
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

      if (community.ownerId !== userId && userRole !== 'superadmin') {
        throw createError("Only the owner can delete this community", 403);
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
      // Idempotent: re-tapping "Request to Join" while a request is pending
      // should not error — it just confirms the request is already in flight.
      if (alreadyMember && alreadyMember.status === 'active')
        throw createError("You are already a member of this community", 409);
      if (alreadyMember && alreadyMember.status === 'pending')
        return { status: 'pending' };
      
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
        await notificationService.publishNotification({
          type: 'REQUEST_TO_JOIN_COMMUNITY',
          recipientId: adminsId[0],
          // publishNotification reads senderId/resourceType/resourceId — the
          // old actorId/entityId/entityType keys were silently dropped, so the
          // row landed with NULL sender + NULL resource and the app had nothing
          // to open when tapped.
          senderId: userId,
          resourceType: 'community',
          resourceId: communityId,
          title: 'Join request',
          message: `${user.name} requested to join ${community.name}`,
        })
      }else {
        await this.communityRepo.incrementMemberCount(communityId);
        await notificationService.publishNotification({
          type: 'FOLLOW',
          recipientId: adminsId[0],
          senderId: userId,
          resourceType: 'community',
          resourceId: communityId,
          title: 'New community member',
          message: `${user.name} joined the community`,
        })
        
        // Award XP for joining a community
        if (this.xpSvc) {
          this.xpSvc.creditXP({
            userId,
            xp: 20,
            transactionType: 'earned',
            sourceType: `community_join_${communityId}`,
          }).catch(e => console.error('Failed to award community join XP:', e));
        }
      }

      return { status };
    } catch (error) {
      throw error;
    }
  }

  async leave({communityId, userId}) {
    try {
      const community = await this.communityRepo.findById(communityId);
      if (community?.ownerId === userId)
        throw createError('Owner cannot leave the community', 400);

      const member = await this.communityRepo.isMember(communityId, userId);
      if (!member) throw createError("You are not a member of this community", 404);

      await this.communityRepo.removeMember(communityId, userId);
      // Only ACTIVE members counted toward member_count — a pending request
      // was never counted, so cancelling it must not decrement.
      if (member.status === 'active') {
        await this.communityRepo.decrementMemberCount(communityId);
      }
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
          throw createError("Only community members can access this private community", 403);
      }

      const { rows, total } = await this.communityRepo.getMembers(communityId, 'active', limit, offset);
      // The owner's membership row stores role='admin' (seeded at creation) —
      // surface it distinctly so the app can render owner/admin/member badges
      // and show the right contextual actions in the member list.
      const members = rows.map((m) => ({
        ...m,
        role: m.user_id === community.ownerId ? 'owner' : (m.role || 'member'),
      }));
      const viewer = await this.communityRepo.getMember(communityId, userId);
      const viewerRole =
        userId === community.ownerId ? 'owner' : (viewer?.role || 'visitor');

      return { rows: members, total, ownerId: community.ownerId, viewerRole };
    } catch (error) {
      throw error;
    }
  }

  // Owner-only: promote a member to admin or demote an admin back to member.
  async updateMemberRole({communityId, targetUserId, userId, role}) {
    try {
      const community = await this.communityRepo.findById(communityId);
      if (!community) throw createError('Community not found', 404);

      if (community.ownerId !== userId)
        throw createError('Only the community owner can manage admins', 403);

      const target = await this.communityRepo.getMember(communityId, targetUserId);
      if (!target) throw createError('User is not a member of this community', 404);
      if (target.status !== 'active')
        throw createError('Only active members can be made admin', 400);
      if (targetUserId === community.ownerId)
        throw createError("The owner's role cannot be changed", 400);
      if (!['admin', 'member'].includes(role))
        throw createError('Role must be admin or member', 400);

      await this.communityRepo.updateMemberRole(communityId, targetUserId, role);
      await this.communityRepo.logModeration({
        communityId,
        actorId: userId,
        action: role === 'admin' ? 'make_admin' : 'remove_admin',
        targetUserId,
      });

      // Let the promoted member know.
      if (role === 'admin') {
        const user = await this.userRepo.findById(targetUserId);
        await notificationService.publishNotification({
          type: 'FOLLOW',
          recipientId: targetUserId,
          senderId: userId,
          resourceType: 'community',
          resourceId: communityId,
          title: 'You are now a community admin',
          message: `${user.name} made you an admin of ${community.name}`,
        });
      }
      return { role };
    } catch (error) {
      throw error;
    }
  }

  // Owner-only: hand the community to another active member. The old owner is
  // automatically demoted to admin — never left outside the community.
  async transferOwnership({communityId, userId, targetUserId}) {
    try {
      const community = await this.communityRepo.findById(communityId);
      if (!community) throw createError('Community not found', 404);

      if (community.ownerId !== userId)
        throw createError('Only the community owner can transfer ownership', 403);
      if (targetUserId === userId)
        throw createError('You already own this community', 400);

      const target = await this.communityRepo.getMember(communityId, targetUserId);
      if (!target) throw createError('Target user is not a member of this community', 404);
      if (target.status !== 'active')
        throw createError('Only active members can receive ownership', 400);

      // Atomic hand-over: swap owner_id, demote the old owner to admin (re-
      // inserting their membership row if it ever went missing), and stamp
      // updated_at — all in ONE transaction so a mid-transfer failure can
      // never strand the old owner outside their own community. The
      // community's allow_reposts column is untouched: the toggle rides with
      // the community, not the owner, so a transfer never resets it.
      await this.communityRepo.transferOwnership({
        communityId,
        newOwnerId: targetUserId,
        oldOwnerId: userId,
      });

      const targetUser = await this.userRepo.findById(targetUserId);
      await this.communityRepo.logModeration({
        communityId,
        actorId: userId,
        action: 'transfer_ownership',
        targetUserId,
        details: { from: userId, to: targetUserId },
      });
      await notificationService.publishNotification({
        type: 'FOLLOW',
        recipientId: targetUserId,
        senderId: userId,
        resourceType: 'community',
        resourceId: communityId,
        title: 'Community ownership transferred',
        message: `${targetUser.name}, you are now the owner of ${community.name}`,
      });

      return this.communityRepo.findById(communityId);
    } catch (error) {
      throw error;
    }
  }

  // Owner/admins only: paginated history of moderation actions in this
  // community (kicks, role changes, ownership transfers, request decisions,
  // community-post removals by moderators).
  async getModerationLog({communityId, userId, limit, offset}) {
    try {
      const community = await this.communityRepo.findById(communityId);
      if (!community) throw createError('Community not found', 404);

      const member = await this.communityRepo.getMember(communityId, userId);
      const isOwner = community.ownerId === userId;
      const isAdmin = member?.role === 'admin' || member?.role === 'moderator';
      if (!isOwner && !isAdmin)
        throw createError('Only community owners and admins can view the moderation log', 403);

      return this.communityRepo.getModerationLog(communityId, limit, offset);
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
          throw createError("Only community members can access this private community", 403);
      }
      
      const { rows, total } = await this.postSvc.findPostByCommunity({ communityId, limit, offset, userId });
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

      if (!canApprove) throw createError("Only community moderators can approve members", 403);

      const isMember = await this.communityRepo.isMember(communityId, targetUserId);
      if (!isMember) throw createError("No join request found for this community", 404);

      if (isMember.status === 'active')
        throw createError("He is already a member of this community", 409);

      await this.communityRepo.updateMemberStatus(communityId, targetUserId, 'active');
      await this.communityRepo.incrementMemberCount(communityId);
      await this.communityRepo.logModeration({
        communityId,
        actorId: approvalId,
        action: 'approve_join',
        targetUserId,
      });

      const user = await this.userRepo.findById(targetUserId)
      
      const jobdata = {
        communityId: communityId, 
        userId: user.id, 
        userName: user.name, 
        userUsername: user.username, 
        approvalId: approvalId
      }
      
      await notificationService.publishNotification({
        type: 'FOLLOW',
        recipientId: targetUserId,
        senderId: approvalId,
        resourceType: 'community',
        resourceId: communityId,
        title: 'Community request approved',
        message: `${user.name} approved your request`,
      })
    } catch (error) {
      throw error;
    }
  }

  async getJoinRequests({communityId, userId, limit, offset}) {
    try {
      const community = await this.communityRepo.findById(communityId);
      if (!community) throw createError('Community not found', 404);

      const member = await this.communityRepo.getMember(communityId, userId);
      const isAdmin = member?.role === 'admin' || member?.role === 'moderator';
      if (!isAdmin) throw createError("Only community admins can view join requests", 403);

      return this.communityRepo.getMembers(communityId, 'pending', limit, offset);
    } catch (error) {
      throw error;
    }
  }

  async removeMember({communityId, targetUserId, userId: approvalId, userRole: approvalRole}) {
    try {
      const community = await this.communityRepo.findById(communityId);
      if (!community) throw createError('Community not found', 404);

      // Admins must not be able to kick themselves — that left the community
      // with a dead-end state (removed member who still owns the community).
      // Use the Leave action instead (owner cannot leave either).
      if (targetUserId === approvalId)
        throw createError('You cannot remove yourself from the community', 400);

      // The owner is untouchable — ownership only changes via transfer.
      if (targetUserId === community.ownerId)
        throw createError('The community owner cannot be removed — transfer ownership first', 400);

      const member = await this.communityRepo.getMember(communityId, approvalId);
      const isOwner = community.ownerId === approvalId;
      const isAdmin = member?.role === 'admin' || member?.role === 'moderator';
      const isPlatformAdmin = ['admin', 'superadmin'].includes(approvalRole);
      if (!isOwner && !isAdmin && !isPlatformAdmin)
        throw createError("Only community admins can remove members", 403);

      const targetMember = await this.communityRepo.getMember(communityId, targetUserId);
      if (!targetMember) throw createError("He is not a member of this community", 404);

      // Admins can only kick regular members — removing another admin (or the
      // moderator) is the owner's job.
      if ((targetMember.role === 'admin' || targetMember.role === 'moderator') && !isOwner && !isPlatformAdmin)
        throw createError("Only the community owner can remove admins", 403);

      await this.communityRepo.removeMember(communityId, targetUserId);
      await this.communityRepo.logModeration({
        communityId,
        actorId: approvalId,
        // Removing a PENDING member is a request rejection; removing an ACTIVE
        // member is a kick — the log distinguishes the two.
        action: targetMember.status === 'pending' ? 'reject_join' : 'kick_member',
        targetUserId,
      });
      
      if (targetMember.status === 'active') {
        await this.communityRepo.decrementMemberCount(communityId);
      }
    } catch (error) {
      throw error;
    }
  }
}

module.exports = CommunityService;
