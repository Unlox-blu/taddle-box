'use strict';

// ─── src/routes/post.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { postController } = require('../modules/post/post.container');
const { verifyToken, optionalAuth } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/authorized.middleware');
const { validateRequest } = require('../middlewares/validator.middleware');
const { postViewLimiter } = require('../middlewares/rate-limiter.middleware');
const {
  createPostSchema,
  updatePostSchema,
  postIdParamsSchema,
  authorIdParamsSchema,
  paginationQuerySchema,
  getPostQuerySchema,
  pollVoteSchema,
  pollVotersQuerySchema,
} = require('../modules/post/post.validator');

router.post(
  '/create-post',
  verifyToken,
  validateRequest({ body: createPostSchema }),
  postController.createPost
);
router.get(
  '/:postId',
  optionalAuth,
  validateRequest({ params: postIdParamsSchema, query: getPostQuerySchema }),
  postController.getPost
);
// Cast (or move) the user's vote on a post poll — one vote per user, enforced
// by the poll_votes UNIQUE(post_id, user_id) constraint.
router.post(
  '/:postId/poll/vote',
  verifyToken,
  validateRequest({ params: postIdParamsSchema, body: pollVoteSchema }),
  postController.castPollVote
);
// The poll author stops further votes (idempotent).
router.post(
  '/:postId/poll/close',
  verifyToken,
  validateRequest({ params: postIdParamsSchema }),
  postController.closePoll
);
// Paginated list of users who voted for ONE option of a post poll — same
// shape as the likers list so the app can reuse the users-list modal.
router.get(
  '/:postId/poll/voters',
  verifyToken,
  validateRequest({ params: postIdParamsSchema, query: pollVotersQuerySchema }),
  postController.getPollVoters
);
// Paginated list of users who liked a post (with viewer follow state).
router.get(
  '/:postId/likes',
  optionalAuth,
  validateRequest({ params: postIdParamsSchema, query: paginationQuerySchema }),
  postController.getLikers
);
// Paginated list of users who reposted a post (with viewer follow state).
router.get(
  '/:postId/reposts',
  optionalAuth,
  validateRequest({ params: postIdParamsSchema, query: paginationQuerySchema }),
  postController.getReposters
);
router.get(
    '/user/:authorId', 
    optionalAuth, 
    validateRequest({ params: authorIdParamsSchema, query: paginationQuerySchema }),
    postController.getUserPosts
);
router.patch(
  '/:postId/update-post',
  verifyToken,
  validateRequest({ body: updatePostSchema, params: postIdParamsSchema }),
  postController.updatePost
);
router.delete(
  '/:postId',
  verifyToken,
  validateRequest({ params: postIdParamsSchema }),
  postController.deletePost
);

// Record a post impression — called when a post thread is opened. Fire-and-
// forget server-side; never throws on a deleted post. Rate-limited per user
// (120/10 min) as defense-in-depth over the per-user unique-view dedup.
router.post(
  '/:postId/view',
  verifyToken,
  postViewLimiter,
  validateRequest({ params: postIdParamsSchema }),
  postController.recordView
);
router.post(
  '/:postId/like',
  verifyToken,
  validateRequest({ params: postIdParamsSchema }),
  postController.likePost
);
router.delete(
  '/:postId/like',
  verifyToken,
  validateRequest({ params: postIdParamsSchema }),
  postController.unlikePost
);
router.post(
  '/:postId/share',
  verifyToken,
  validateRequest({ params: postIdParamsSchema }),
  postController.sharePost
);
router.post(
  '/:postId/repost',
  verifyToken,
  validateRequest({ params: postIdParamsSchema }),
  postController.repostPost
);
router.delete(
  '/:postId/repost',
  verifyToken,
  validateRequest({ params: postIdParamsSchema }),
  postController.unrepostPost
);
router.post(
  '/:postId/bookmark',
  verifyToken,
  validateRequest({ params: postIdParamsSchema }),
  postController.bookmarkPost
);
router.delete(
  '/:postId/bookmark',
  verifyToken,
  validateRequest({ params: postIdParamsSchema }),
  postController.removebookmarkPost
);
router.delete(
  '/:postId/force',
  verifyToken,
  authorize('admin', 'superadmin'),
  validateRequest({ params: postIdParamsSchema }),
  postController.forceDeletePost
);

module.exports = router;
