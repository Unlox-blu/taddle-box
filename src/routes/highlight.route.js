'use strict';

// ─── src/routes/user.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { highlightController }         = require('../modules/highlight/highlight.container');
const { verifyToken } = require('../middlewares/auth.middleware');
const { validateRequest }               = require('../middlewares/validator.middleware');
const { paginationQuerySchema } = require('../modules/highlight/highlight.validator');


router.get('/',     verifyToken,     validateRequest({query: paginationQuerySchema}),     highlightController.getSpotligth)

module.exports = router