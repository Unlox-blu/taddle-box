'use strict';

// ─── src/routes/community.route.js ───────────────────────────────────────────
const router = require('express').Router();
const { communityController }        = require('../modules/community/community.container');
const { verifyToken, optionalAuth }  = require('../middlewares/auth.middleware');
const { authorize }                  = require('../middlewares/authorized.middleware');
const { validateRequest }                   = require('../middlewares/validator.middleware');
const { createCommunitySchema, updateCommunitySchema, updateAvatarSchema, updateBannerSchema, slugParamsSchema, communityIdParamsSchema, communityIdAndUserIdParamsSchema, paginationQuerySchema } = require('../modules/community/community.validator');


router.get('/discover',                                optionalAuth, validateRequest({query: paginationQuerySchema}),             communityController.discoverCommunity);
router.get('/:slug',                                   optionalAuth, validateRequest({params: slugParamsSchema}),                 communityController.getBySlug);
router.get('/:communityId/members',                    optionalAuth, validateRequest({params: communityIdParamsSchema}),          communityController.getMembers);
router.get('/:communityId/requests',                   verifyToken,  validateRequest({params: communityIdParamsSchema}),          communityController.getRequests);
router.get('/:communityId/posts',                      optionalAuth, validateRequest({params: communityIdParamsSchema}),          communityController.getCommunityPosts);

router.post('/create-community',                       verifyToken,  validateRequest({body: createCommunitySchema}),              communityController.create);
router.post('/:communityId/join',                      verifyToken,  validateRequest({params: communityIdParamsSchema}),          communityController.join);
router.post('/:communityId/members/:userId/approve',   verifyToken,  validateRequest({params: communityIdAndUserIdParamsSchema}), communityController.approveMember);

router.patch('/:communityId/update-community',         verifyToken,  validateRequest({body: updateCommunitySchema}),              communityController.update);
router.patch('/:communityId/update-community-avatar',  verifyToken,  validateRequest({body: updateAvatarSchema}),                 communityController.updateAvatar);
router.patch('/:communityId/update-community-banner',  verifyToken,  validateRequest({body: updateBannerSchema}),                 communityController.updateBanner);

router.delete('/:communityId/leave',                   verifyToken,  validateRequest({params: communityIdParamsSchema}),          communityController.leave);
router.delete('/:communityId/members/:userId',         verifyToken,  validateRequest({params: communityIdAndUserIdParamsSchema}), communityController.removeMember);
router.delete('/:communityId',                         verifyToken,  validateRequest({params: communityIdParamsSchema}),          communityController.remove);

module.exports = router;
