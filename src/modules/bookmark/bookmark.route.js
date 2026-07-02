'use strict';

// ─── src/routes/wallet.route.js ──────────────────────────────────────────────
const router = require('express').Router();
const { bookmarkController } = require('./bookmark.container');
const { verifyToken }      = require('../../middlewares/auth.middleware');
const { validate }         = require('../../middlewares/validator.middleware');
const { creditOrdebitXPSchema } = require('../../validators/xp.validator');

router.get('/',                  verifyToken,                                   bookmarkController.getBookmarks);

module.exports = router;
