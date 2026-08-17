'use strict';


const router = require('express').Router();
const { activeStatusController } = require('../modules/activestatus/activestatus.container');
const { verifyToken }    = require('../middlewares/auth.middleware');
const { validateRequest } = require('../middlewares/validator.middleware');
const { userIdParamSchema, activeStatusBatchBodySchema } = require('../modules/activestatus/activestatus.validator');

router.post('/',         verifyToken,                                                       activeStatusController.createStatus);
router.post('/batch',    verifyToken,   validateRequest({body: activeStatusBatchBodySchema}),  activeStatusController.getBatch);
router.get('/:userId',   verifyToken,      validateRequest({params: userIdParamSchema}),      activeStatusController.getStatus);


module.exports = router;
