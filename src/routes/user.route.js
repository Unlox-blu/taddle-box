'use strict';

// ─── src/routes/user.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { userController }         = require('../modules/user/user.container');
const { verifyToken, optionalAuth } = require('../middlewares/auth.middleware');
const { validateRequest }               = require('../middlewares/validator.middleware');
const { uploadSingle }           = require('../middlewares/upload.middleware');
const { locationCaptureLimiter } = require('../middlewares/rate-limiter.middleware');
const { updateProfileSchema, updateUsernameSchema, updatePrivacySchema, updateBannerSchema, updateAvatarSchema, usernameSchema, followerIdSchema, locationBodySchema } = require('../modules/user/user.validator');

// GEO location telemetry (only sent when the user granted location permission).
// POST appends a capture-history row; DELETE wipes that history (Settings → Privacy).
// Capture is throttled client-side (5 min) AND server-side (every 60s) so the
// append-only history table can't be flooded by a misbehaving client.
router.post('/location',                 verifyToken,     locationCaptureLimiter,    validateRequest({body: locationBodySchema}),     userController.recordLocation);
router.delete('/location',               verifyToken,                                                    userController.clearLocation);

router.patch('/update-profile',             verifyToken,     validateRequest({body: updateProfileSchema}),  userController.updateProfile);
router.patch('/update-avatar',               verifyToken,    validateRequest({body: updateAvatarSchema}),   userController.updateAvatar);
router.patch('/update-banner',               verifyToken,    validateRequest({body: updateBannerSchema}),   userController.updateBanner);
router.patch('/update-username',            verifyToken,     validateRequest({body: updateUsernameSchema}), userController.updateUsername);
router.patch('/update-privacy',             verifyToken,     validateRequest({body: updatePrivacySchema}),  userController.updatePrivacy);
router.get('/bookmarked',                   verifyToken,                                                    userController.getbookmarked);
router.get('/save',                         verifyToken,                                                    userController.getsaved);
router.delete('/me',                        verifyToken,                                                    userController.deleteAccount);
// Security / App Lock
router.post('/pin/setup',                   verifyToken,                                                    userController.setupAppLock);
router.post('/pin/verify',                  verifyToken,                                                    userController.verifyAppLock);
router.post('/pin/reset',                   verifyToken,                                                    userController.resetAppLock);
router.post('/pin/remove',                  verifyToken,                                                    userController.removeAppLock);
router.post('/pin/toggle-global',           verifyToken,                                                    userController.toggleAppLock);

// follow/unfollow routes
router.get('/follow-requests',              verifyToken,                                                    userController.getFollowRequests);
router.post('/follow-requests/accept-all', verifyToken,                                                    userController.acceptAllFollowRequests);
router.get('/:username',                    optionalAuth,    validateRequest({params: usernameSchema}),     userController.getProfile);
router.get('/:username/mutuals',            verifyToken,     validateRequest({params: usernameSchema}),     userController.getMutuals);
router.get('/:username/followers',          verifyToken,     validateRequest({params: usernameSchema}),     userController.getFollowers);
router.get('/:username/following',          verifyToken,     validateRequest({params: usernameSchema}),     userController.getFollowing);
router.post('/:username/follow',            verifyToken,     validateRequest({params: usernameSchema}),     userController.followUser);
router.patch('/:followerId/approve-follower',verifyToken,    validateRequest({params: followerIdSchema}),   userController.approveTofollow);
router.delete('/:followerId/reject-follower',verifyToken,    validateRequest({params: followerIdSchema}),   userController.rejectFollowRequest);
router.delete('/:username/unfollow',        verifyToken,     validateRequest({params: usernameSchema}),     userController.unfollowUser);
router.delete('/:username/remove-follower', verifyToken,     validateRequest({params: usernameSchema}),     userController.removeFollower);

module.exports = router;
