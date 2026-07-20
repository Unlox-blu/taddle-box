'use strict';

// ─── src/routes/user.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { userController }         = require('../modules/user/user.container');
const { verifyToken, optionalAuth } = require('../middlewares/auth.middleware');
const { validateRequest }               = require('../middlewares/validator.middleware');
const { uploadSingle }           = require('../middlewares/upload.middleware');
const { updateProfileSchema, updateUsernameSchema, updatePrivacySchema, updateBannerSchema, updateAvatarSchema, usernameSchema, followerIdSchema } = require('../modules/user/user.validator');

router.patch('/update-profile',             verifyToken,     validateRequest({body: updateProfileSchema}),  userController.updateProfile);
router.patch('/update-avatar',               verifyToken,    validateRequest({body: updateAvatarSchema}),   userController.updateAvatar);
router.patch('/update-banner',               verifyToken,    validateRequest({body: updateBannerSchema}),   userController.updateBanner);
router.patch('/update-username',            verifyToken,     validateRequest({body: updateUsernameSchema}), userController.updateUsername);
router.patch('/update-privacy',             verifyToken,     validateRequest({body: updatePrivacySchema}),  userController.updatePrivacy);
router.get('/bookmarked',                   verifyToken,                                                    userController.getbookmarked);
router.get('/save',                         verifyToken,                                                    userController.getsaved);
router.delete('/me',                        verifyToken,                                                    userController.deleteAccount);

// follow/unfollow routes
router.get('/:username',                    optionalAuth,    validateRequest({params: usernameSchema}),     userController.getProfile);
router.get('/:username/followers',          verifyToken,     validateRequest({params: usernameSchema}),     userController.getFollowers);
router.get('/:username/following',          verifyToken,     validateRequest({params: usernameSchema}),     userController.getFollowing);
router.post('/:username/follow',            verifyToken,     validateRequest({params: usernameSchema}),     userController.followUser);
router.patch('/:followerId/approve-follower',verifyToken,    validateRequest({params: followerIdSchema}),   userController.approveTofollow);
router.delete('/:username/unfollow',        verifyToken,     validateRequest({params: usernameSchema}),     userController.unfollowUser);
router.delete('/:username/remove-follower', verifyToken,     validateRequest({params: usernameSchema}),     userController.removeFollower);

module.exports = router;
