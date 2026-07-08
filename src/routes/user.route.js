'use strict';

// ─── src/routes/user.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { userController }         = require('../modules/user/user.container');
const { verifyToken, optionalAuth } = require('../middlewares/auth.middleware');
const { validateRequest }               = require('../middlewares/validator.middleware');
const { uploadSingle }           = require('../middlewares/upload.middleware');
const { updateProfileSchema, updateUsernameSchema, updatePrivacySchema, updateBannerSchema, updateAvatarSchema } = require('../modules/user/user.validator');

router.patch('/update-profile',             verifyToken,     validateRequest({body: updateProfileSchema}),     userController.updateProfile);
router.patch('/update-avatar',               verifyToken,    validateRequest({body: updateAvatarSchema}),     userController.updateAvatar);
router.patch('/update-banner',               verifyToken,    validateRequest({body: updateBannerSchema}),     userController.updateBanner);
router.patch('/update-username',            verifyToken,     validateRequest({body: updateUsernameSchema}),    userController.updateUsername);
router.patch('/update-privacy',             verifyToken,     validateRequest({body: updatePrivacySchema}),     userController.updatePrivacy);
router.get('/bookmarked',                   verifyToken,     userController.getbookmarked);
router.get('/save',                         verifyToken,     userController.getsaved);

// follow/unfollow routes
router.get('/:username',                    optionalAuth,                                       userController.getProfile);
router.get('/:username/followers',          verifyToken,     userController.getFollowers);
router.get('/:username/following',          verifyToken,     userController.getFollowing);
router.post('/:username/follow',            verifyToken,     userController.followUser);
router.patch('/:followerId/approve-follower',verifyToken,     userController.approveTofollow);
router.delete('/:username/unfollow',        verifyToken,     userController.unfollowUser);
router.delete('/:username/remove-follower', verifyToken,     userController.removeFollower);

module.exports = router;
