'use strict';

const { createError } = require('../utils/error.util');
const CommentModel = require('../models/comment.model');

class CommentService {
  constructor({ commentRepository, postRepository, notificationService, feedService }) {
    this.commentRepo = commentRepository;
    this.postRepo = postRepository;
    this.notifSvc = notificationService;
    this.feedSvc = feedService;
  }

  async createComment({ postId, authorId, content, parentId }) {
    try {
      const post = await this.postRepo.findById(postId);
      if (!post) throw createError('Post not found', 404);

      if (post.community_privacy !== 'public') {
        //do authorization
      }

      // Compute nested thread path + depth
      let depth = 0;
      let path = [];
      if (parentId) {
        const parent = await this.commentRepo.findById(parentId);
        if (!parent) throw createError('Parent comment not found', 404);
        if (parent.depth >= 5) throw createError('Maximum reply depth reached', 400);
        depth = parent.depth + 1;
        path = [...(parent.path || []), parent.id];
      }

      const comment = await this.commentRepo.create({
        postId,
        authorId,
        content,
        parentId,
        depth,
        path,
      });
      await this.postRepo.incrementCommentCount(postId);

      // TODO: notify post author (if not self)
      const type = 'Comment'
      const title = 'Post comment'
      const message = `Post: ${post.id}, Comment: ${content}.`
         
      await this.notifSvc.create({ recipientId: post.author_id, senderId: authorId, type, title, message })

      this.feedSvc.updatePreferences(authorId, post.category || [], post.tags || [])
      return CommentModel.format(comment);
    } catch (error) {
      throw error;
    }
  }

  async updateComment(commentId, userId, content) {
    try {
      const comment = await this.commentRepo.findById(commentId);
      if (!comment) throw createError('Comment not found', 404);
      if (comment.author_id !== userId)
        throw createError('Not authorized to edit this comment', 403);
      const updated = await this.commentRepo.update(commentId, content);
      return CommentModel.format(updated);
    } catch (error) {
      throw error;
    }
  }

  async deleteComment(commentId, userId, userRole) {
    try {
      const comment = await this.commentRepo.findById(commentId);
      if (!comment) throw createError('Comment not found', 404);

      const isOwner = comment.author_id === userId;
      const isMod = ['admin', 'moderator', 'superadmin'].includes(userRole);
      if (!isOwner && !isMod) throw createError('Not authorized to delete this comment', 403);

      await this.commentRepo.softDelete(commentId);
      await this.postRepo.decrementCommentCount(comment.post_id);
    } catch (error) {
      throw error;
    }
  }

  async likeComment(commentId, userId) {
    try {
      const alreadyLiked = await this.commentRepo.isLikedByUser(commentId, userId);
      if (alreadyLiked) throw createError('Comment already liked', 409);
      await this.commentRepo.addLike(commentId, userId);
      await this.commentRepo.incrementLikeCount(commentId);
    } catch (error) {
      throw error;
    }
  }

  async unlikeComment(commentId, userId) {
    try {
      const isLiked = await this.commentRepo.isLikedByUser(commentId, userId);
      if (!isLiked) throw createError('Comment not liked', 409);

      await this.commentRepo.removeLike(commentId, userId);
      await this.commentRepo.decrementLikeCount(commentId);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = CommentService;
