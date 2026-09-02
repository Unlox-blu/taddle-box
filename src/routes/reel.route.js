'use strict';

const router = require('express').Router();
const { reelSessionController } = require('../modules/reel-session/reel.session.container');
const { verifyToken } = require('../middlewares/auth.middleware');

// Create a new Reel session with frozen ranking
router.post('/session', verifyToken, reelSessionController.createSession);

// Load a page of posts from an existing session (auto-extends when exhausted)
router.get('/session/:sessionId', verifyToken, reelSessionController.loadPage);

module.exports = router;
