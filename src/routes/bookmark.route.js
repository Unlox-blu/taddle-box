'use strict';

// ─── src/routes/wallet.route.js ──────────────────────────────────────────────
const router = require('express').Router();
const { bookmarkController } = require('../modules/bookmark/bookmark.container');
const { verifyToken }      = require('../middlewares/auth.middleware');
const { validate }         = require('../middlewares/validator.middleware');

router.get('/',                  verifyToken,                                   bookmarkController.getBookmarks);

module.exports = router;
