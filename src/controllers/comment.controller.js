'use strict';

const { apiResponse } = require('../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../utils/pagination.util');

class CommentController {
  constructor({ commentService }) {
    this.commentSvc = commentService;
  }

  create = async (req, res, next) => {
    try {
      const authorId = req.userId;
      const comment = await this.commentSvc.createComment({ ...req.body, authorId });
      res.status(201).json(apiResponse(comment, 'Comment added'));
    } catch (err) {
      next(err);
    }
  };

  update = async (req, res, next) => {
    try {
      const { commentId } = req.params;
      const userId = req.userId;
      const { content } = req.body;
      const comment = await this.commentSvc.updateComment(commentId, userId, content);
      res.json(apiResponse(comment, 'Comment updated'));
    } catch (err) {
      next(err);
    }
  };

  delete = async (req, res, next) => {
    try {
      const { commentId } = req.params;
      const userId = req.userId;
      const userRole = req.userRole;
      await this.commentSvc.deleteComment(commentId, userId, userRole);
      res.json(apiResponse(null, 'Comment deleted'));
    } catch (err) {
      next(err);
    }
  };

  like = async (req, res, next) => {
    try {
      const { commentId } = req.params;
      const userId = req.userId;
      await this.commentSvc.likeComment(commentId, userId);
      res.json(apiResponse(null, 'Comment liked'));
    } catch (err) {
      next(err);
    }
  };

  unlike = async (req, res, next) => {
    try {
      const { commentId } = req.params;
      const userId = req.userId;
      await this.commentSvc.unlikeComment(commentId, userId);
      res.json(apiResponse(null, 'Comment unliked'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = CommentController;
