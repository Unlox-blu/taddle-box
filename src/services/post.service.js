'use strict';

const { createError } = require('../utils/error.util');
const PostModel = require('../models/post.model');

class PostService {
  constructor({ postRepository, communityRepository, notificationService }) {
    this.postRepo = postRepository;
    this.communityRepo = communityRepository;
    this.notifSvc = notificationService;
  }

  async getPosts(filters, limit, offset) {
    const { rows, total } = await this.postRepo.search(filters, limit, offset);
    return { posts: rows.map(PostModel.format), total };
  }

  async getPost(postId) {
    const post = await this.postRepo.findById(postId);
    if (!post) throw createError('Post not found', 404);
    // Fire-and-forget view count — don't block the response
    // this.postRepo.incrementViewCount(postId).catch(() => { });
    return PostModel.format(post);
  }

  async getUserPosts(userId, limit, offset) {
    const { rows, total } = await this.postRepo.findManyByUser(userId, limit, offset);
    return { posts: rows.map(PostModel.format), total };
  }

  async createPost(authorId, data) {
    const { communityId } = data;

    // Validate community membership if posting to a community
    if (communityId) {
      const isMember = await this.communityRepo.isMember(communityId, authorId);
      if (!isMember) throw createError('You must be a member to post in this community', 403);
    }

    const post = await this.postRepo.create({ ...data, authorId });

    // TODO: queue fanout notification to followers via notificationService
    return PostModel.format(post);
  }

  async updatePost(postId, userId, data) {
    const post = await this.postRepo.findById(postId);
    if (!post) throw createError('Post not found', 404);
    if (post.author_id !== userId) throw createError('Not authorized to edit this post', 403);
    const updated = await this.postRepo.update(postId, data);
    return PostModel.format(updated);
  }

  async deletePost(postId, userId, userRole) {
    const post = await this.postRepo.findById(postId);
    if (!post) throw createError('Post not found', 404);
    const isOwner = post.author_id === userId;
    const isMod = ['admin', 'moderator', 'superadmin'].includes(userRole);
    if (!isOwner && !isMod) throw createError('Not authorized to delete this post', 403);
    await this.postRepo.softDelete(postId);
  }

  async forceDeletePost(postId) {
    await this.postRepo.hardDelete(postId);
  }

  async likePost(postId, userId) {
    const alreadyLiked = await this.postRepo.isLikedByUser(postId, userId);
    if (alreadyLiked) throw createError('Post already liked', 409);
    await this.postRepo.addLike(postId, userId);
    await this.postRepo.incrementLikeCount(postId);
    // TODO: notify post author via notificationService
  }

  async unlikePost(postId, userId) {
    const isLiked = await this.postRepo.isLikedByUser(postId, userId);
    if (!isLiked) throw createError('Post not liked', 409);
    await this.postRepo.removeLike(postId, userId);
    await this.postRepo.decrementLikeCount(postId);
  }

  async sharePost(postId) {
    await this.postRepo.incrementShareCount(postId);
  }
}

module.exports = PostService;
