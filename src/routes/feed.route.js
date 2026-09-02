'use strict';

// ─── src/routes/feed.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { feedController } = require('../modules/feed/feed.container');
const { verifyToken, optionalAuth } = require('../middlewares/auth.middleware');
const { validateRequest } = require('../middlewares/validator.middleware');
const { paginationQuerySchema } = require('../modules/feed/feed.validator');

router.get('/hashtags', verifyToken,                                                        feedController.getTrendingHashtags);
router.get('/home',     verifyToken,    validateRequest({query: paginationQuerySchema}),    feedController.getFeed);
router.get('/newer-count', verifyToken,                                                     feedController.getNewerCount);
router.get('/user/:authorId',    optionalAuth, (req, res, next) => require('../modules/post/post.container').postController.getUserPosts(req, res, next));
router.get('/community/:communityId', optionalAuth, (req, res, next) => require('../modules/community/community.container').communityController.getCommunityPosts(req, res, next));

module.exports = router;
