'use strict';

const { createError } = require('../utils/error.util');
const CommentModel = require('../models/comment.model');

class CommentService {
  constructor({ commentRepository, postRepository, userRepository, notificationService, feedService, communityRepository }) {
    this.commentRepo = commentRepository;
    this.communityRepo = communityRepository;
    this.userRepo = userRepository;
    this.postRepo = postRepository;
    this.notifSvc = notificationService;
    this.feedSvc = feedService;
  }

  async create({ postId, authorId, content, parentId }) {
    try {
      const post = await this.postRepo.findById(postId);
      if (!post) throw createError('Post not found', 404);

      if (post.community_id && post.community_privacy !== 'public') {
        //do authorization
        const isMember = await this.communityRepo.isMember(post.community_id, authorId)
        
        if(!isMember || isMember.status !== 'active'){
          throw createError('You are not allowed to comment in this community post', 403)
        }
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

      const user = await this.userRepo.findById(authorId)
      const data = { 
        postId: post.id, 
        recipientId: post.author_id, 
        emiterName: user.name, 
        emiterUsername: user.username, 
        emiterId: user.id,
        comment: content
      }
      
      await addNotificationJob('post_comment', data)

      this.feedSvc.updatePreferences(authorId, post.category || [], post.tags || [])
      return CommentModel.format(comment);
    } catch (error) {
      throw error;
    }
  }

  async getComments({postId, parentId, limit, offset}) {
    try {
      const post = await this.postRepo.findById(postId);
      if (!post) throw createError('Post not found', 404);
      if (post.community_id && post.community_privacy !== 'public') {
        //do authorization
        const isMember = await this.communityRepo.isMember(post.community_id, authorId)
        if(!isMember || isMember.status !== 'active'){
          throw createError('You are not authorized for this community post', 403)
        }
      }

      const {rows, total} = await this.commentRepo.findByPost(postId, limit, offset, parentId)
      return {comments: rows.map(CommentModel.format), total}
    } catch (error) {
      throw error
    }
  }

  async update({commentId, userId, content}) {
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

  async delete({commentId, userId, userRole}) {
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

  async like({commentId, userId}) {
    try {
      const alreadyLiked = await this.commentRepo.isLikedByUser(commentId, userId);
      if (alreadyLiked) throw createError('Comment already liked', 409);
      await this.commentRepo.addLike(commentId, userId);
      await this.commentRepo.incrementLikeCount(commentId);
    } catch (error) {
      throw error;
    }
  }

  async unlike({commentId, userId}) {
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
