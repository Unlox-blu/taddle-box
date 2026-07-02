'use strict';

// ─── src/routes/event.route.js ───────────────────────────────────────────────
const router = require('express').Router();
const { eventController }            = require('./event.container');
const { verifyToken, optionalAuth }  = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/authorized.middleware');
const { validate }                   = require('../../middlewares/validator.middleware');
const { createEventSchema, updateEventSchema } = require('./event.validator');


router.get('/:eventId',              optionalAuth, eventController.getById);
router.post('/:eventId/register',    verifyToken,  eventController.register);
router.post('/:eventId/save',        verifyToken,  eventController.saveEvent);
router.delete('/:eventId/save',        verifyToken,  eventController.removeSavedEvent);
router.delete('/:eventId/register',  verifyToken,  eventController.cancelRegistration);

//admin route only
router.post('/create-event',         verifyToken,                   validate(createEventSchema), eventController.create);
router.patch('/update-event/:eventId', verifyToken, authorize('admin', 'superadmin'),  validate(updateEventSchema), eventController.update);
router.delete('/:eventId',           verifyToken, authorize('admin', 'superadmin'),  eventController.remove);
router.get('/:eventId/attendees',    verifyToken,   eventController.getAttendees);

module.exports = router;
