'use strict';

// ─── src/routes/user.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { userController }         = require('../container');
const { verifyToken, optionalAuth } = require('../middlewares/auth.middleware');
const { validate }               = require('../middlewares/validator.middleware');
const { uploadSingle }           = require('../middlewares/upload.middleware');
const { updateProfileSchema, updateUsernameSchema, updatePrivacySchema, updateBannerSchema, updateAvatarSchema } = require('../validators/user.validator');

router.patch('/update-profile',             verifyToken,     validate(updateProfileSchema),     userController.updateProfile);
router.patch('/update-avatar',               verifyToken,    validate(updateAvatarSchema),     userController.updateAvatar);
router.patch('/update-banner',               verifyToken,    validate(updateBannerSchema),     userController.updateBanner);
router.patch('/update-username',            verifyToken,     validate(updateUsernameSchema),    userController.updateUsername);
router.patch('/update-privacy',             verifyToken,     validate(updatePrivacySchema),     userController.updatePrivacy);
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
