'use strict';

const { createError } = require('../utils/error.util');
const PostModel = require('../models/post.model');
const { uploadFile } = require('../integrations/storage/cloudinary.service');
const { addNotificationJob } = require('../jobs/queues/notification.queue');

class PostService {
  constructor({ postRepository, communityRepository, bookmarkRepository, notificationService, feedService, userRepository }) {
    this.postRepo = postRepository;
    this.communityRepo = communityRepository;
    this.bookmarkRepo = bookmarkRepository;
    this.userRepo = userRepository;
    this.notifSvc = notificationService;
    this.feedSvc = feedService;
  }  

  async createPost({userId: authorId, body: data, mediaFiles}) {
    try {
      const { communityId } = data;

      // Validate community membership if posting to a community
      if (communityId) {
        const isCommunityExist = await this.communityRepo.findById(communityId);
        if (!isCommunityExist) throw createError('Community not found', 404);

        const isMember = await this.communityRepo.isMember(communityId, authorId);
        if (!isMember || isMember.status !== 'active')
          throw createError('You must be a member to post in this community', 403);
      }

      if(mediaFiles) {
        data.media = await Promise.all(mediaFiles.map(async (file) => {
          const {url} = await uploadFile(file.data, 'posts', authorId)
          return url
        }))
      }

      const post = await this.postRepo.create({ ...data, authorId });

      this.feedSvc.updatePreferences(authorId, data.category || [], data.tags || [])
      return PostModel.format(post);
    } catch (error) {
      throw error;
    }
  }

  async getPost({postId, userId}) {
    try {
      const post = await this.postRepo.findById(postId);
      if (!post) throw createError('Post not found', 404);
      const { community_id: communityId } = post;

      if (communityId) {
        const community = await this.communityRepo.findById(communityId);
        if (community.privacy === 'private') {
          if (!userId) throw createError('This is a private community', 403);

          const isMember = await this.communityRepo.isMember(communityId, userId);
          if (!isMember || isMember.status !== 'active')
            throw createError('This is private community', 403);
        }
      }
      return PostModel.format(post);
    } catch (error) {
      throw error;
    }
  }

  async getUserPosts({authorId, userId, limit, offset}) {
    try {
      if (userId === authorId) {
        const { rows, total } = await this.postRepo.findManyByUser(userId, limit, offset);
        return { posts: rows.map(PostModel.format), total };
      }
      const { rows, total } = await this.postRepo.findManyByUser(authorId, limit, offset);

      const posts = rows.filter(
        (ele) => ele.community_privacy !== 'private' && ele.visibility === 'public'
      );
      return { posts: posts.map(PostModel.format), total };
    } catch (error) {
      throw error;
    }
  }

  async updatePost({postId, userId: authorId, body: data}) {
    try {
      const post = await this.postRepo.findById(postId);
      if (!post) throw createError('Post not found', 404);
      if (post.author_id !== authorId) throw createError('Not authorized to edit this post', 403);
      const updated = await this.postRepo.update(postId, data);
      
      this.feedSvc.updatePreferences(authorId, data.category || [], data.tags || [])
      return PostModel.format(updated);
    } catch (error) {
      throw error;
    }
  }

  async deletePost({postId, userId, userRole}) {
    try {
      const post = await this.postRepo.findById(postId);
      if (!post) throw createError('Post not found', 404);
      const isOwner = post.author_id === userId;
      const isMod = ['admin', 'moderator', 'superadmin'].includes(userRole);
      if (!isOwner && !isMod) throw createError('Not authorized to delete this post', 403);
      await this.postRepo.softDelete(postId);
    } catch (error) {
      throw error;
    }
  }

  async likePost({postId, userId}) {
    try {
      const post = await this.postRepo.findById(postId)
      if(!post) throw createError("Post not found", 404)
        
      const alreadyLiked = await this.postRepo.isLikedByUser(postId, userId);
      if (alreadyLiked) throw createError('Post already liked', 409);
      
      await this.postRepo.addLike(postId, userId);
      await this.postRepo.incrementLikeCount(postId);
      const user = await this.userRepo.findById(userId)
      const jobdata = { 
        postId: post.id, 
        recipientId: post.author_id, 
        emiterName: user.name, 
        emiterUsername: user.username, 
        emiterId: user.id
      }
      
      await addNotificationJob('post_like', jobdata)

      this.feedSvc.updatePreferences(userId, post.category || [], post.tags || [])
    } catch (error) {
      throw error;
    }
  }

  async unlikePost({postId, userId}) {
    try {
      const isLiked = await this.postRepo.isLikedByUser(postId, userId);
      if (!isLiked) throw createError('Post already not liked', 409);
      await this.postRepo.removeLike(postId, userId);
      await this.postRepo.decrementLikeCount(postId);
    } catch (error) {
      throw error;
    }
  }

  async sharePost({postId}) {
    try {
      const post = await this.postRepo.findById(postId)
      if(!post) throw createError("Post not found", 404)
      await this.postRepo.incrementShareCount(postId);
    } catch (error) {
      throw error;
    }
  }

  async bookmarkPost({userId, postId}) {
    try {
      const post = await this.postRepo.findById(postId)
      if(!post) throw createError('Post not found', 404)
      
      await this.bookmarkRepo.create(userId, postId)
    } catch (error) {
      throw error
    }
  }

  async removebookmarkPost({userId, postId}) {
    try {
      const isBookmarked = await this.bookmarkRepo.findByUserIdAndPostId(userId, postId)
      if(!isBookmarked) throw createError('Post alreadey not bookmarked', 409)
      
      await this.bookmarkRepo.hardDelete(userId, postId)
    } catch (error) {
      throw error
    }
  }

  async forceDeletePost({userRole, postId}) {
    try {
      if (userRole !== 'superadmin' || userRole !== 'admin')
        throw createError('Not authorized to delete this post', 403);

      await this.postRepo.hardDelete(postId);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = PostService;
