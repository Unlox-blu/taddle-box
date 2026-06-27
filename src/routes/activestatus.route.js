'use strict';


const router = require('express').Router();
const { activeStatusController } = require('../container');
const { verifyToken }    = require('../middlewares/auth.middleware');

router.get('/:userId', verifyToken,            activeStatusController.getStatus);

module.exports = router;
