'use strict';

// ─── src/routes/user.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { shareController }         = require('../modules/share/share.container');
const { verifyToken, optionalAuth } = require('../middlewares/auth.middleware');
const { validateRequest }               = require('../middlewares/validator.middleware');


router.get('/post/:postId',                 optionalAuth,                       shareController.getPost)
router.get('/profile/:profileId',           optionalAuth,                       shareController.getProfile)
router.get('/event/:eventId',               optionalAuth,                       shareController.getEvent)
router.get('/community/:communityId',       optionalAuth,                       shareController.getCommunity)

module.exports = router