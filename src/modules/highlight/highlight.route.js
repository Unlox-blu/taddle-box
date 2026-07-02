'use strict';

// ─── src/routes/user.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { highlightController }         = require('./highlight.container');
const { verifyToken } = require('../../middlewares/auth.middleware');
const { validate }               = require('../../middlewares/validator.middleware');


router.get('/',                        verifyToken,                                   highlightController.getSpotligth)

module.exports = router