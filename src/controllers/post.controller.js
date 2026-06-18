'use strict';

const { apiResponse } = require('../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../utils/pagination.util');
const CommentModel = require('../models/comment.model');

class PostController {
  constructor({ postService }) {
    this.postSvc = postService;
  }

  createPost = async (req, res, next) => {
    try {
      const userId = req.userId;
      const body = req.body;
      const mediaFiles = req.files ? req.files.media : null;

      const post = await this.postSvc.createPost(userId, body, mediaFiles);
      res.status(201).json(apiResponse(post, 'Post created successfully'));
    } catch (error) {
      next(error);
    }
  };

  getPost = async (req, res, next) => {
    try {
      const { postId } = req.params;
      const userId = req.userId;
      const post = await this.postSvc.getPost(postId, userId);
      res.json(apiResponse(post, 'Post fetched successfully!'));
    } catch (error) {
      next(error);
    }
  };

  getUserPosts = async (req, res, next) => {
    try {
      const { authorId } = req.params;
      const userId = req.userId;
      const { limit, offset, page } = getPaginationParams(req.query);
      const { posts, total } = await this.postSvc.getUserPosts(authorId, userId, limit, offset);
      res.json(apiResponse(posts, 'Posts fetched successfully', paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  };

  updatePost = async (req, res, next) => {
    try {
      const { postId } = req.params;
      const userId = req.userId;
      const body = req.body;
      const post = await this.postSvc.updatePost(postId, userId, body);
      res.json(apiResponse(post, 'Post updated'));
    } catch (error) {
      next(error);
    }
  };

  deletePost = async (req, res, next) => {
    try {
      const { postId } = req.params;
      const userId = req.userId;
      const userRole = req.userRole;
      await this.postSvc.deletePost(postId, userId, userRole);
      res.json(apiResponse(null, 'Post deleted'));
    } catch (error) {
      next(error);
    }
  };

  likePost = async (req, res, next) => {
    try {
      const { postId } = req.params;
      const userId = req.userId;
      await this.postSvc.likePost(postId, userId);
      res.json(apiResponse(null, 'Post liked'));
    } catch (error) {
      next(error);
    }
  };

  unlikePost = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { postId } = req.params;
      await this.postSvc.unlikePost(postId, userId);
      res.json(apiResponse(null, 'Post unliked'));
    } catch (error) {
      next(error);
    }
  };

  sharePost = async (req, res, next) => {
    try {
      const { postId } = req.params;
      await this.postSvc.sharePost(postId);
      res.json(apiResponse(null, 'Post shared'));
    } catch (error) {
      next(error);
    }
  };

  bookmarkPost = async (req, res, next) => {
    try {
      const userId = req.userId
      const {postId} = req.params
      await this.postSvc.bookmarkPost(userId, postId)
      res.status(201).json(apiResponse(null, 'Post shaved successfully'));
    } catch (error) {
      next(error)
    }
  }

  forceDeletePost = async (req, res, next) => {
    try {
      const userId = req.userId;
      const userRole = req.userRole;
      const { postId } = req.params;
      await this.postSvc.forceDeletePost(userRole, postId);
      res.json(apiResponse(null, 'Post permanently deleted'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = PostController;
