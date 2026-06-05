'use strict';

// ─── src/routes/event.route.js ───────────────────────────────────────────────
const router = require('express').Router();
const { eventController }            = require('../container');
const { verifyToken, optionalAuth }  = require('../middlewares/auth.middleware');
const { validate }                   = require('../middlewares/validator.middleware');
const { createEventSchema, updateEventSchema } = require('../validators/event.validator');

// router.get('/',                      optionalAuth, eventController.browse);
router.post('/create-event',         verifyToken,  validate(createEventSchema), eventController.create);
router.get('/:eventId',              optionalAuth, eventController.getById);
router.patch('/update-event/:eventId', verifyToken,  validate(updateEventSchema), eventController.update);
router.delete('/:eventId',           verifyToken,  eventController.remove);
router.post('/:eventId/register',    verifyToken,  eventController.register);
router.delete('/:eventId/register',  verifyToken,  eventController.cancelRegistration);
router.get('/:eventId/attendees',    verifyToken,  eventController.getAttendees);

module.exports = router;
