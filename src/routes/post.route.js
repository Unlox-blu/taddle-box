'use strict';

// ─── src/routes/post.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { postController }             = require('../container');
const { verifyToken, optionalAuth }  = require('../middlewares/auth.middleware');
const { authorize }                  = require('../middlewares/authorized.middleware');
const { validate }                   = require('../middlewares/validator.middleware');
const { createPostSchema, updatePostSchema } = require('../validators/post.validator');

// router.get('/',                  optionalAuth,  postController.getPosts);
// router.get('/:postId',           optionalAuth,  postController.getPost);
// router.get('/user/:userId',      optionalAuth,  postController.getUserPosts);
router.post('/create-post',                 verifyToken,   validate(createPostSchema), postController.createPost);
router.patch('/:postId',         verifyToken,   validate(updatePostSchema), postController.updatePost);
router.delete('/:postId',        verifyToken,   postController.deletePost);
router.post('/:postId/like',     verifyToken,   postController.likePost);
router.delete('/:postId/like',   verifyToken,   postController.unlikePost);
router.post('/:postId/share',    verifyToken,   postController.sharePost);
// router.get('/:postId/comments',  optionalAuth,  postController.getPostComments);
router.delete('/:postId/force',  verifyToken,   authorize('admin', 'moderator'), postController.forceDeletePost);

module.exports = router;
