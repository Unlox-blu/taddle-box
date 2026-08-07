'use strict';

// ─── src/routes/search.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { searchController } = require('../modules/search/search.container');
const { optionalAuth, verifyToken }    = require('../middlewares/auth.middleware');
const { validateRequest } = require('../middlewares/validator.middleware');
const { searchQuerySchema } = require('../modules/search/search.validator');

router.get('/discover', verifyToken,   validateRequest({query: searchQuerySchema}),   searchController.discover);
router.get('/all', optionalAuth, validateRequest({query: searchQuerySchema}),   searchController.searchAll);
router.get('/hashtags', searchController.getHashtags);
router.get('/', optionalAuth,   validateRequest({query: searchQuerySchema}),   searchController.search);

module.exports = router;
