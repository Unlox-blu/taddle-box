'use strict';

const { apiResponse } = require('../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../utils/pagination.util');

class CommentController {
  constructor({ commentService }) {
    this.commentSvc = commentService;
  }

  create = async (req, res, next) => {
    try {
      const comment = await this.commentSvc.createComment({ ...req.body, authorId: req.userId });
      res.status(201).json(apiResponse(comment, 'Comment added'));
    } catch (err) { next(err); }
  };

  update = async (req, res, next) => {
    try {
      const comment = await this.commentSvc.updateComment(req.params.commentId, req.userId, req.body.content);
      res.json(apiResponse(comment, 'Comment updated'));
    } catch (err) { next(err); }
  };

  remove = async (req, res, next) => {
    try {
      await this.commentSvc.deleteComment(req.params.commentId, req.userId, req.userRole);
      res.json(apiResponse(null, 'Comment deleted'));
    } catch (err) { next(err); }
  };

  like = async (req, res, next) => {
    try {
      await this.commentSvc.likeComment(req.params.commentId, req.userId);
      res.json(apiResponse(null, 'Comment liked'));
    } catch (err) { next(err); }
  };

  unlike = async (req, res, next) => {
    try {
      await this.commentSvc.unlikeComment(req.params.commentId, req.userId);
      res.json(apiResponse(null, 'Comment unliked'));
    } catch (err) { next(err); }
  };
}

module.exports = CommentController;
