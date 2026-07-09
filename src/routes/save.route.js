'use strict';

// ─── src/routes/wallet.route.js ──────────────────────────────────────────────
const router = require('express').Router();
const { saveController } = require('../modules/save/save.container');
const { verifyToken }      = require('../middlewares/auth.middleware');
const { validateRequest } = require('../middlewares/validator.middleware');
const { paginationQuerySchema } = require('../modules/save/save.validator');

router.get('/',                  verifyToken,      validateRequest({query: paginationQuerySchema}),         saveController.getSave);

module.exports = router;
