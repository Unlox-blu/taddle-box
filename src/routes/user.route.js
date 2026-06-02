'use strict';

// ─── src/routes/user.route.js ────────────────────────────────────────────────
const router = require('express').Router();
const { userController }         = require('../container');
const { verifyToken, optionalAuth } = require('../middlewares/auth.middleware');
const { validate }               = require('../middlewares/validator.middleware');
const { uploadSingle }           = require('../middlewares/upload.middleware');
const { updateProfileSchema, updateUsernameSchema } = require('../validators/user.validator');

// router.get('/',                             optionalAuth,  userController.searchUsers);
// router.get('/:username',                    optionalAuth,  userController.getProfile);
router.patch('/update-profile',        verifyToken,     validate(updateProfileSchema), userController.updateProfile);
// router.post('/update-avatar',  verifyToken,     uploadSingle('avatar'),        userController.updateAvatar);
router.post('/update-avatar',  verifyToken,              userController.updateAvatar);
router.patch('/update-username', verifyToken,   validate(updateUsernameSchema), userController.updateUsername);
// router.get('/followers', verifyToken,    userController.getFollowers);
// router.get('/following', verifyToken,    userController.getFollowing);
// router.post('/:userId/follow',   verifyToken, userController.followUser);
// router.delete('/:userId/follow', verifyToken, userController.unfollowUser);

module.exports = router;
