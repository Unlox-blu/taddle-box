'use strict';

// ─── src/routes/comment.route.js ─────────────────────────────────────────────
const router = require('express').Router();
const { commentController } = require('../modules/comment/comment.container');
const { verifyToken }       = require('../middlewares/auth.middleware');
const { validateRequest }          = require('../middlewares/validator.middleware');
const { createCommentSchema, updateCommentSchema } = require('../modules/comment/comment.validator');

router.post('/',                     verifyToken, validateRequest({ body: createCommentSchema}),    commentController.create);
router.get('/:postId',               verifyToken ,                                      commentController.getComments);
router.patch('/:commentId',          verifyToken, validateRequest({ body: updateCommentSchema}),    commentController.update);
router.delete('/:commentId',         verifyToken,                                       commentController.delete);
router.post('/:commentId/like',      verifyToken,                                       commentController.like);
router.delete('/:commentId/like',    verifyToken,                                       commentController.unlike);

module.exports = router;
