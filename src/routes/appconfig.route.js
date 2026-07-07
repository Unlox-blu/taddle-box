'use strict';

const router = require('express').Router();
const { appConfigController } = require('../modules/appconfig/appconfig.container');


router.get('/',                     appConfigController.getAppConfig)

module.exports = router;
