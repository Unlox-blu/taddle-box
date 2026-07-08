'use strict';

// ─── src/routes/user.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { highlightController }         = require('../modules/highlight/highlight.container');
const { verifyToken } = require('../middlewares/auth.middleware');
const { validateRequest }               = require('../middlewares/validator.middleware');


router.get('/',                        verifyToken,                                   highlightController.getSpotligth)

module.exports = router