'use strict';

// ─── src/routes/comment.route.js ─────────────────────────────────────────────
const router = require('express').Router();
const { commentController } = require('../container');
const { verifyToken }       = require('../middlewares/auth.middleware');
const { validate }          = require('../middlewares/validator.middleware');
const { createCommentSchema, updateCommentSchema } = require('../validators/comment.validator');

router.post('/',                     verifyToken, validate(createCommentSchema), commentController.create);
router.get('/:postId',                     verifyToken ,                         commentController.getComments);
router.patch('/:commentId',          verifyToken, validate(updateCommentSchema), commentController.update);
router.delete('/:commentId',         verifyToken,                                commentController.delete);
router.post('/:commentId/like',      verifyToken,                                commentController.like);
router.delete('/:commentId/like',    verifyToken,                                commentController.unlike);

module.exports = router;
