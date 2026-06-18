'use strict';

// ─── src/routes/community.route.js ───────────────────────────────────────────
const router = require('express').Router();
const { communityController }        = require('../container');
const { verifyToken, optionalAuth }  = require('../middlewares/auth.middleware');
const { authorize }                  = require('../middlewares/authorized.middleware');
const { validate }                   = require('../middlewares/validator.middleware');
const { createCommunitySchema, updateCommunitySchema } = require('../validators/community.validator');


router.post('/create-community',                       verifyToken,  validate(createCommunitySchema),   communityController.create);
router.get('/:slug',                                   optionalAuth,                                    communityController.getBySlug);
router.patch('/:communityId/update-community',         verifyToken,  validate(updateCommunitySchema),   communityController.update);
router.patch('/:communityId/update-community-avatar',  verifyToken,                                     communityController.updateAvatar);
router.patch('/:communityId/update-community-banner',  verifyToken,                                     communityController.updateBanner);
router.delete('/:communityId',                         verifyToken,                                     communityController.remove);
router.post('/:communityId/join',                      verifyToken,                                     communityController.join);
router.delete('/:communityId/leave',                   verifyToken,                                     communityController.leave);
router.get('/:communityId/members',                    optionalAuth,                                    communityController.getMembers);
router.get('/:communityId/posts',                      optionalAuth,                                    communityController.getCommunityPosts);
router.post('/:communityId/members/:userId/approve',   verifyToken,                                     communityController.approveMember);
router.delete('/:communityId/members/:userId',         verifyToken,                                     communityController.removeMember);

module.exports = router;
