'use strict';

// ─── src/routes/user.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { shareController }         = require('../modules/share/share.container');
const { verifyToken, optionalAuth } = require('../middlewares/auth.middleware');
const { validateRequest }               = require('../middlewares/validator.middleware');
const { postIdParamSchema, profileIdParamSchema, eventIdParamSchema, communityIdParamSchema } = require('../modules/share/share.validator');


router.get('/post/:postId',              optionalAuth,  validateRequest({params: postIdParamSchema}),         shareController.getPost)
router.get('/profile/:profileId',        optionalAuth,  validateRequest({params: profileIdParamSchema}),      shareController.getProfile)
router.get('/event/:eventId',            optionalAuth,  validateRequest({params: eventIdParamSchema}),        shareController.getEvent)
router.get('/community/:communityId',    optionalAuth,  validateRequest({params: communityIdParamSchema}),    shareController.getCommunity)

module.exports = router