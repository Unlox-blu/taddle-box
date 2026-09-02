'use strict';

const { apiResponse } = require('../../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../../utils/pagination.util');

class PostController {
  constructor({ postService }) {
    this.postSvc = postService;
  }

  createPost = async (req, res, next) => {
    console.log("CREATE POST BODY:", req.body);
    try {
      const userId = req.userId;
      const body = req.body;

      const post = await this.postSvc.createPost({userId, body});
      res.status(201).json(apiResponse(post, 'Post created successfully'));
    } catch (error) {
      next(error);
    }
  };

  getPost = async (req, res, next) => {
    try {
      const { postId } = req.params;
      const { via_repost: viaRepostId } = req.query;
      const userId = req.userId;
      const post = await this.postSvc.getPost({postId, userId, viaRepostId});
      res.json(apiResponse(post, 'Post fetched successfully!'));
    } catch (error) {
      next(error);
    }
  };

  castPollVote = async (req, res, next) => {
    try {
      const { postId } = req.params;
      const { optionIndex } = req.body;
      const result = await this.postSvc.castPollVote({
        userId: req.userId,
        postId,
        optionIndex,
      });
      res.json(apiResponse(result, 'Vote recorded'));
    } catch (error) {
      next(error);
    }
  };

  closePoll = async (req, res, next) => {
    try {
      const { postId } = req.params;
      const result = await this.postSvc.closePoll({
        userId: req.userId,
        postId,
      });
      res.json(apiResponse(result, 'Poll closed'));
    } catch (error) {
      next(error);
    }
  };

  getUserPosts = async (req, res, next) => {
    try {
      const { authorId } = req.params;
      const userId = req.userId;
      const { limit, offset, page } = getPaginationParams(req.query);
      const useCursor = !!req.query.cursor;
      const type = req.query.type || 'all';
      const { posts, total } = await this.postSvc.getUserPosts({authorId, userId, limit, offset, type});
      const { envelopeItem } = require('../../utils/envelope.util');
      res.json({
        success: true,
        message: 'Posts fetched successfully',
        data: {
          items: posts.map(p => envelopeItem('post', p)),
          pagination: paginationMeta(total, page, limit, useCursor)
        }
      });
    } catch (error) {
      next(error);
    }
  };

  updatePost = async (req, res, next) => {
    try {
      const { postId } = req.params;
      const userId = req.userId;
      const body = req.body;
      const post = await this.postSvc.updatePost({postId, userId, body});
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
      await this.postSvc.deletePost({postId, userId, userRole});
      res.json(apiResponse(null, 'Post deleted'));
    } catch (error) {
      next(error);
    }
  };

  recordView = async (req, res, next) => {
    try {
      const { postId } = req.params;
      const userId = req.userId;
      await this.postSvc.recordView({ postId, userId });
      res.json(apiResponse(null, 'View recorded'));
    } catch (error) {
      next(error);
    }
  };

  likePost = async (req, res, next) => {
    try {
      const { postId } = req.params;
      const userId = req.userId;
      await this.postSvc.likePost({postId, userId});
      res.json(apiResponse(null, 'Post liked'));
    } catch (error) {
      next(error);
    }
  };

  getLikers = async (req, res, next) => {
    try {
      const { postId } = req.params;
      const userId = req.userId;
      const { search } = req.query;
      const { limit, offset, page } = getPaginationParams(req.query);
      const { likers, total } = await this.postSvc.getLikers({ postId, userId, limit, offset, search });
      res.json(apiResponse(likers, 'Likers fetched', paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  };

  // Paginated list of users who voted for ONE option of a post poll.
  getPollVoters = async (req, res, next) => {
    try {
      const userId = req.userId;
      const postId = req.params.postId;
      const { search } = req.query;
      const optionIndex = parseInt(req.query.option, 10);
      const { limit, offset } = getPaginationParams(req.query);
      const { voters, total } = await this.postSvc.getPollVoters({ postId, optionIndex, userId, limit, offset, search });
      res.json(apiResponse({ dataType: 'voters', data: voters, total }, 'Poll voters fetched'));
    } catch (error) {
      next(error);
    }
  };

  getReposters = async (req, res, next) => {
    try {
      const { postId } = req.params;
      const userId = req.userId;
      const { search } = req.query;
      const { limit, offset, page } = getPaginationParams(req.query);
      const { reposters, total } = await this.postSvc.getReposters({ postId, userId, limit, offset, search });
      res.json(apiResponse(reposters, 'Reposters fetched', paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  };

  unlikePost = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { postId } = req.params;
      await this.postSvc.unlikePost({postId, userId});
      res.json(apiResponse(null, 'Post unliked'));
    } catch (error) {
      next(error);
    }
  };

  sharePost = async (req, res, next) => {
    try {
      const userId = req.userId
      const { postId } = req.params;
      await this.postSvc.sharePost({userId, postId});
      res.json(apiResponse(null, 'Post shared'));
    } catch (error) {
      next(error);
    }
  };

  repostPost = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { postId } = req.params;
      const { content, tags, mentions, communityId } = req.body || {};
      const post = await this.postSvc.repostPost({userId, postId, content, tags, mentions, communityId});
      res.status(201).json(apiResponse(post, 'Post reposted successfully'));
    } catch (error) {
      next(error);
    }
  };

  unrepostPost = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { postId } = req.params;
      const result = await this.postSvc.unrepostPost({userId, postId});
      res.json(apiResponse(result, 'Repost removed'));
    } catch (error) {
      next(error);
    }
  };

  bookmarkPost = async (req, res, next) => {
    try {
      const userId = req.userId
      const {postId} = req.params
      await this.postSvc.bookmarkPost({userId, postId})
      res.status(201).json(apiResponse(null, 'Post shaved successfully'));
    } catch (error) {
      next(error)
    }
  }

  removebookmarkPost = async (req, res, next) => {
    try {
      const userId = req.userId
      const {postId} = req.params
      await this.postSvc.removebookmarkPost({userId, postId})
      res.json(apiResponse(null, 'Post removed successfully'));
    } catch (error) {
      next(error)
    }
  }

  forceDeletePost = async (req, res, next) => {
    try {
      const userId = req.userId;
      const userRole = req.userRole;
      const { postId } = req.params;
      await this.postSvc.forceDeletePost({userRole, postId});
      res.json(apiResponse(null, 'Post permanently deleted'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = PostController;
