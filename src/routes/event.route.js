'use strict';

// ─── src/routes/event.route.js ───────────────────────────────────────────────
const router = require('express').Router();
const { eventController }            = require('../modules/event/event.container');
const { verifyToken, optionalAuth }  = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/authorized.middleware');
const { validateRequest }                   = require('../middlewares/validator.middleware');
const { createEventSchema, updateEventSchema, eventIdParamsSchema } = require('../modules/event/event.validator');

const { searchQuerySchema } = require('../modules/search/search.validator');

router.get('/discover',              optionalAuth, validateRequest({ query: searchQuerySchema }), eventController.discover);
router.get('/:eventId',              optionalAuth, validateRequest({ params: eventIdParamsSchema}), eventController.getById);
router.post('/:eventId/register',    verifyToken,  validateRequest({ params: eventIdParamsSchema}), eventController.register);
router.post('/:eventId/save',        verifyToken,  validateRequest({ params: eventIdParamsSchema}), eventController.saveEvent);
router.delete('/:eventId/save',      verifyToken,  validateRequest({ params: eventIdParamsSchema}), eventController.removeSavedEvent);
router.delete('/:eventId/register',  verifyToken,  validateRequest({ params: eventIdParamsSchema}), eventController.cancelRegistration);

//admin route only
router.post('/create-event',         verifyToken,  validateRequest({ body: createEventSchema, params: eventIdParamsSchema}), eventController.create);
router.patch('/update-event/:eventId', verifyToken, authorize('admin', 'superadmin'),  validateRequest({ body: updateEventSchema, params: eventIdParamsSchema}), eventController.update);
router.delete('/:eventId',           verifyToken, authorize('admin', 'superadmin'), validateRequest({ params: eventIdParamsSchema}), eventController.remove);
router.get('/:eventId/attendees',    verifyToken, validateRequest({ params: eventIdParamsSchema}),  eventController.getAttendees);

module.exports = router;
