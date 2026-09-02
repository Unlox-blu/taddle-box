'use strict';

const router = require('express').Router();
const { feedSessionController } = require('../modules/feed-session/feed.session.container');
const { verifyToken } = require('../middlewares/auth.middleware');

// Create a new feed session (home, profile, bookmarks, community, search, reels)
router.post('/', verifyToken, feedSessionController.createSession);

// Load a page of posts from an existing session (auto-extends when exhausted)
router.get('/:sessionId', verifyToken, feedSessionController.loadPage);

module.exports = router;
