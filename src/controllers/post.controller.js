'use strict';

const { apiResponse } = require('../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../utils/pagination.util');
const CommentModel = require('../models/comment.model');

class PostController {
  constructor({ postService }) {
    this.postSvc = postService;
  }

  getPosts = async (req, res, next) => {
    try {
      const { limit, offset, page } = getPaginationParams(req.query);
      const { posts, total } = await this.postSvc.getPosts(req.query, limit, offset);
      res.json(apiResponse(posts, 'Posts fetched', paginationMeta(total, page, limit)));
    } catch (err) { next(err); }
  };

  getPost = async (req, res, next) => {
    try {
      const post = await this.postSvc.getPost(req.params.postId);
      res.json(apiResponse(post));
    } catch (err) { next(err); }
  };

  getUserPosts = async (req, res, next) => {
    try {
      const { limit, offset, page } = getPaginationParams(req.query);
      const { posts, total } = await this.postSvc.getUserPosts(req.params.userId, limit, offset);
      res.json(apiResponse(posts, 'Posts fetched', paginationMeta(total, page, limit)));
    } catch (err) { next(err); }
  };

  createPost = async (req, res, next) => {
    try {
      const post = await this.postSvc.createPost(req.userId, req.body);
      res.status(201).json(apiResponse(post, 'Post created'));
    } catch (err) { next(err); }
  };

  updatePost = async (req, res, next) => {
    try {
      const post = await this.postSvc.updatePost(req.params.postId, req.userId, req.body);
      res.json(apiResponse(post, 'Post updated'));
    } catch (err) { next(err); }
  };

  deletePost = async (req, res, next) => {
    try {
      await this.postSvc.deletePost(req.params.postId, req.userId, req.userRole);
      res.json(apiResponse(null, 'Post deleted'));
    } catch (err) { next(err); }
  };

  likePost = async (req, res, next) => {
    try {
      await this.postSvc.likePost(req.params.postId, req.userId);
      res.json(apiResponse(null, 'Post liked'));
    } catch (err) { next(err); }
  };

  unlikePost = async (req, res, next) => {
    try {
      await this.postSvc.unlikePost(req.params.postId, req.userId);
      res.json(apiResponse(null, 'Post unliked'));
    } catch (err) { next(err); }
  };

  sharePost = async (req, res, next) => {
    try {
      await this.postSvc.sharePost(req.params.postId);
      res.json(apiResponse(null, 'Post shared'));
    } catch (err) { next(err); }
  };

  forceDeletePost = async (req, res, next) => {
    try {
      await this.postSvc.forceDeletePost(req.params.postId);
      res.json(apiResponse(null, 'Post permanently deleted'));
    } catch (err) { next(err); }
  };
}

module.exports = PostController;
