'use strict';

// ─── src/routes/post.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { postController }             = require('./post.container');
const { verifyToken, optionalAuth }  = require('../../middlewares/auth.middleware');
const { authorize }                  = require('../../middlewares/authorized.middleware');
const { validate }                   = require('../../middlewares/validator.middleware');
const { createPostSchema, updatePostSchema } = require('./post.validator');


router.post('/create-post',             verifyToken,   validate(createPostSchema),          postController.createPost);
router.get('/:postId',                  optionalAuth,                                       postController.getPost);
router.get('/user/:authorId',           optionalAuth,                                       postController.getUserPosts); 
router.patch('/:postId/update-post',    verifyToken,   validate(updatePostSchema),          postController.updatePost);
router.delete('/:postId',               verifyToken,                                        postController.deletePost);

router.post('/:postId/like',            verifyToken,                                        postController.likePost);
router.delete('/:postId/like',          verifyToken,                                        postController.unlikePost);
router.post('/:postId/share',           verifyToken,                                        postController.sharePost);
router.post('/:postId/bookmark',        verifyToken,                                        postController.bookmarkPost);
router.delete('/:postId/bookmark',      verifyToken,                                        postController.removebookmarkPost);
router.delete('/:postId/force',         verifyToken,   authorize('admin', 'superadmin'),    postController.forceDeletePost);

module.exports = router;
