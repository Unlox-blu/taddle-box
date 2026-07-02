'use strict';

const { apiResponse } = require('../../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../../utils/pagination.util');

class CommentController {
  constructor({ commentService }) {
    this.commentSvc = commentService;
  }

  create = async (req, res, next) => {
    try {
      const authorId = req.userId;
      const { postId, content, parentId } = req.body
      const comment = await this.commentSvc.create({ postId, content, parentId, authorId });
      res.status(201).json(apiResponse(comment, 'Comment added'));
    } catch (error) {
      next(error);
    }
  };

  getComments = async (req, res, next) => {
    try {
      const userId = req.userId || null
      const {postId} = req.params
      const parentId = req.query.parentId || null
      const { limit, offset, page } = getPaginationParams(req.query);
      const { comments, total } = await this.commentSvc.getComments({postId, userId, parentId, limit, offset});
      res.json(apiResponse(comments, 'Comment added', paginationMeta(total, page, limit)));
    } catch (error) {
      next(error)
    }
  }

  update = async (req, res, next) => {
    try {
      const { commentId } = req.params;
      const userId = req.userId;
      const { content } = req.body;
      const comment = await this.commentSvc.update({commentId, userId, content});
      res.json(apiResponse(comment, 'Comment updated'));
    } catch (error) {
      next(error);
    }
  };

  delete = async (req, res, next) => {
    try {
      const { commentId } = req.params;
      const userId = req.userId;
      const userRole = req.userRole;
      await this.commentSvc.delete({commentId, userId, userRole});
      res.json(apiResponse(null, 'Comment deleted'));
    } catch (error) {
      next(error);
    }
  };

  like = async (req, res, next) => {
    try {
      const { commentId } = req.params;
      const userId = req.userId;
      await this.commentSvc.like({commentId, userId});
      res.json(apiResponse(null, 'Comment liked'));
    } catch (error) {
      next(error);
    }
  };

  unlike = async (req, res, next) => {
    try {
      const { commentId } = req.params;
      const userId = req.userId;
      await this.commentSvc.unlike({commentId, userId});
      res.json(apiResponse(null, 'Comment unliked'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = CommentController;
