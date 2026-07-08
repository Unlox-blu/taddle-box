'use strict';

// ─── src/routes/post.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { postController } = require('../modules/post/post.container');
const { verifyToken, optionalAuth } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/authorized.middleware');
const { validateRequest } = require('../middlewares/validator.middleware');
const {
  createPostSchema,
  updatePostSchema,
  postIdParamsSchema,
  authorIdParamsSchema,
  paginationQuerySchema,
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
  validateRequest({ params: postIdParamsSchema }),
  postController.getPost
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
