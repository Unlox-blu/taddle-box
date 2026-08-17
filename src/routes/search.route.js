'use strict';

// ─── src/routes/search.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { searchController } = require('../modules/search/search.container');
const { optionalAuth, verifyToken }    = require('../middlewares/auth.middleware');
const { validateRequest } = require('../middlewares/validator.middleware');
const { searchQuerySchema } = require('../modules/search/search.validator');
const { searchRateLimiter } = require('../middlewares/rate-limiter.middleware');


router.get('/people',   verifyToken,                                                    searchController.suggestPeople);
router.get('/hashtags', verifyToken,                                                    searchController.getHashtags);
// The unified search is the heaviest endpoint (FTS + trigram scans) — rate
// limited per account AFTER auth resolves so the budget is per-user.
router.get('/',         verifyToken,    searchRateLimiter, validateRequest({query: searchQuerySchema}),    searchController.search);

module.exports = router;
