'use strict';

// ─── src/routes/feed.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { feedController } = require('../modules/feed/feed.container');
const { verifyToken }    = require('../middlewares/auth.middleware');
const { validateRequest } = require('../middlewares/validator.middleware');
const { paginationQuerySchema } = require('../modules/feed/feed.validator');

router.get('/hashtags', verifyToken,                                                        feedController.getTrendingHashtags);
router.get('/',     verifyToken,    validateRequest({query: paginationQuerySchema}),    feedController.getFeed);
router.post('/view-post', verifyToken, feedController.recordPostView);

module.exports = router;
