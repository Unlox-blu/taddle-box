'use strict';

// ─── src/routes/search.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { searchController } = require('./search.container');
const { optionalAuth }    = require('../../middlewares/auth.middleware');

router.get('/', optionalAuth,    searchController.search);

module.exports = router;
