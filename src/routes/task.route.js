'use strict';

// ─── src/routes/user.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { taskController }         = require('../modules/task/task.container');
const { verifyToken } = require('../middlewares/auth.middleware');
const { validate }               = require('../middlewares/validator.middleware');


router.get('/',              verifyToken,                       taskController.getTask)
router.post('/',              verifyToken,                       taskController.createTask)

module.exports = router