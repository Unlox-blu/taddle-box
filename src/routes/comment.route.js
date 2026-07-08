'use strict';

// ─── src/routes/comment.route.js ─────────────────────────────────────────────
const router = require('express').Router();
const { commentController } = require('../modules/comment/comment.container');
const { verifyToken }       = require('../middlewares/auth.middleware');
const { validateRequest }          = require('../middlewares/validator.middleware');
const { createCommentSchema, updateCommentSchema, postIdParamsSchema, commentIdParamsSchema } = require('../modules/comment/comment.validator');

router.post('/',                     verifyToken, validateRequest({body: createCommentSchema}),                                    commentController.create);
router.get('/:postId',               verifyToken, validateRequest({params: postIdParamsSchema}),                                    commentController.getComments);
router.patch('/:commentId',          verifyToken, validateRequest({body: updateCommentSchema, params:commentIdParamsSchema}),      commentController.update);
router.delete('/:commentId',         verifyToken, validateRequest({params: commentIdParamsSchema}),                                 commentController.delete);
router.post('/:commentId/like',      verifyToken, validateRequest({params: commentIdParamsSchema}),                                 commentController.like);
router.delete('/:commentId/like',    verifyToken, validateRequest({params: commentIdParamsSchema}),                                 commentController.unlike);

module.exports = router;
