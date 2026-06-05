'use strict';

const { createError } = require('../utils/error.util');
const PostModel = require('../models/post.model');
const { uploadToCloudinary } = require('../config/cloudinary');

class PostService {
  constructor({ postRepository, communityRepository, notificationService }) {
    this.postRepo = postRepository;
    this.communityRepo = communityRepository;
    this.notifSvc = notificationService;
  }

  async getPosts(filters, limit, offset) {
    try {
      const { rows, total } = await this.postRepo.search(filters, limit, offset);
      return { posts: rows.map(PostModel.format), total };
    } catch (error) {
      throw error;
    }
  }

  async createPost(authorId, data, mediaFiles) {
    try {
      const { communityId } = data;

      // Validate community membership if posting to a community
      if (communityId) {
        const isCommunityExist = await this.communityRepo.findById(communityId);
        if (!isCommunityExist) throw createError('Community not exist', 400);

        const isMember = await this.communityRepo.isMember(communityId, authorId);
        if (!isMember || isMember.status !== 'active')
          throw createError('You must be a member to post in this community', 403);
      }

      const media = await Promise.all(mediaFiles.map((file) => uploadToCloudinary(file.data)));
      data.media = media;

      const post = await this.postRepo.create({ ...data, authorId });

      // TODO: queue fanout notification to followers via notificationService
      return PostModel.format(post);
    } catch (error) {
      throw error;
    }
  }

  async getPost(postId, userId) {
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

  async getUserPosts(authorId, userId, limit, offset) {
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

  async updatePost(postId, userId, data) {
    try {
      const post = await this.postRepo.findById(postId);
      if (!post) throw createError('Post not found', 404);
      if (post.author_id !== userId) throw createError('Not authorized to edit this post', 403);
      const updated = await this.postRepo.update(postId, data);
      return PostModel.format(updated);
    } catch (error) {
      throw error;
    }
  }

  async deletePost(postId, userId, userRole) {
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

  async likePost(postId, userId) {
    try {
      const alreadyLiked = await this.postRepo.isLikedByUser(postId, userId);
      if (alreadyLiked) throw createError('Post already liked', 409);
      await this.postRepo.addLike(postId, userId);
      await this.postRepo.incrementLikeCount(postId);
      // TODO: notify post author via notificationService
    } catch (error) {
      throw error;
    }
  }

  async unlikePost(postId, userId) {
    try {
      const isLiked = await this.postRepo.isLikedByUser(postId, userId);
      if (!isLiked) throw createError('Post already not liked', 409);
      await this.postRepo.removeLike(postId, userId);
      await this.postRepo.decrementLikeCount(postId);
    } catch (error) {
      throw error;
    }
  }

  async sharePost(postId) {
    try {
      await this.postRepo.incrementShareCount(postId);
    } catch (error) {
      throw error;
    }
  }

  async forceDeletePost(userRole, postId) {
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
