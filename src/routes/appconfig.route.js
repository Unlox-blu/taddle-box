'use strict';

const router = require('express').Router();
const { appConfigController } = require('../container');


router.get('/',                     appConfigController.getAppConfig)

module.exports = router;
