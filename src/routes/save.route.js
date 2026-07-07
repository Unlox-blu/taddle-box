'use strict';

// ─── src/routes/wallet.route.js ──────────────────────────────────────────────
const router = require('express').Router();
const { saveController } = require('../modules/save/save.container');
const { verifyToken }      = require('../middlewares/auth.middleware');

router.get('/',                  verifyToken,                                   saveController.getSave);

module.exports = router;
