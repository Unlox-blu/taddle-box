'use strict';


const router = require('express').Router();
const { activeStatusController } = require('./activestatus.container');
const { verifyToken }    = require('../../middlewares/auth.middleware');

router.post('/',         verifyToken,            activeStatusController.createStatus);
router.get('/:userId', verifyToken,            activeStatusController.getStatus);


module.exports = router;
