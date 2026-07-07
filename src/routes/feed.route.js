'use strict';

// ─── src/routes/feed.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { feedController } = require('../modules/feed/feed.container');
const { verifyToken }    = require('../middlewares/auth.middleware');

router.get('/', verifyToken, feedController.getFeed);

module.exports = router;
