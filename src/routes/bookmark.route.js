'use strict';

const router = require('express').Router();
const { bookmarkController } = require('../modules/bookmark/bookmark.container');
const { verifyToken } = require('../middlewares/auth.middleware');
const { validateRequest } = require('../middlewares/validator.middleware');
const {
  bookmarksQuerySchema,
  toggleBookmarkSchema,
  checkBookmarkQuerySchema,
} = require('../modules/bookmark/bookmark.validator');

// GET /bookmark?type=post|profile|community&page=&limit=
router.get(
  '/',
  verifyToken,
  validateRequest({ query: bookmarksQuerySchema }),
  bookmarkController.getBookmarks,
);

// POST /bookmark/toggle  { itemType, itemId }
router.post(
  '/toggle',
  verifyToken,
  validateRequest({ body: toggleBookmarkSchema }),
  bookmarkController.toggleBookmark,
);

// GET /bookmark/check?type=post|profile|community&itemId=xxx
router.get(
  '/check',
  verifyToken,
  validateRequest({ query: checkBookmarkQuerySchema }),
  bookmarkController.checkBookmark,
);

module.exports = router;
