'use strict';


const router = require('express').Router();
const { activeStatusController } = require('../modules/activestatus/activestatus.container');
const { verifyToken }    = require('../middlewares/auth.middleware');
const { validateRequest } = require('../middlewares/validator.middleware');
const { UuidParamSchema } = require('../modules/activestatus/activestatus.validator');

router.post('/',         verifyToken,                                                       activeStatusController.createStatus);
router.get('/:userId',   verifyToken,      validateRequest({params: UuidParamSchema}),      activeStatusController.getStatus);


module.exports = router;
