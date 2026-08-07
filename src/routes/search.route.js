'use strict';

// ─── src/routes/search.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { searchController } = require('../modules/search/search.container');
const { optionalAuth, verifyToken }    = require('../middlewares/auth.middleware');
const { validateRequest } = require('../middlewares/validator.middleware');
const { searchQuerySchema } = require('../modules/search/search.validator');


router.get('/all',      verifyToken,    validateRequest({query: searchQuerySchema}),    searchController.searchAll);
router.get('/hashtags', verifyToken,                                                    searchController.getHashtags);
router.get('/',         verifyToken,    validateRequest({query: searchQuerySchema}),    searchController.search);

module.exports = router;
