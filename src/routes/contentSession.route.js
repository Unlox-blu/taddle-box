'use strict';

const router = require('express').Router();
const { contentSessionController } = require('../modules/content-session/content.session.container');
const { verifyToken } = require('../middlewares/auth.middleware');

// Create a new content session (feed or reels)
router.post('/', verifyToken, contentSessionController.createSession);

// Load a page of content from an existing session (auto-extends when exhausted)
router.get('/:sessionId', verifyToken, contentSessionController.loadPage);

module.exports = router;
