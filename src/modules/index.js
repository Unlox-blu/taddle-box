'use strict';

// ─── src/routes/index.js ─────────────────────────────────────────────────────
const router   = require('express').Router();
const authRoute = require('./auth/auth.route');

// Mount all domain routes under /api/v1
router.use('/auth',          require('./auth/auth.route'));
router.use('/users',         require('./user/user.route'));
router.use('/posts',         require('./post/post.route'));
router.use('/communities',   require('./community/community.route'));
router.use('/comments',      require('./comment/comment.route'));
router.use('/events',        require('./event/event.route'));
router.use('/task',          require('./task/task.route'));
router.use('/wallet',        require('./wallet/wallet.route'));
router.use('/xp',            require('./xp/xp.route'));
router.use('/feed',          require('./feed/feed.route'));
router.use('/notifications', require('./notification/notification.route'));
router.use('/media',         require('./media/media.route'));
router.use('/search',        require('./search/search.route'));
router.use('/share',         require('./share/share.route'));
router.use('/streak',        require('./streak/streak.route'));
router.use('/settings',      require('./settings/settings.route'));
router.use('/highlight',     require('./highlight/highlight.route'));
router.use('/active-status', require('./activestatus/activestatus.route'));
router.use('/app-config',    require('./appconfig/appconfig.route'));
router.use('/bookmark',      require('./bookmark/bookmark.route'));
router.use('/save',          require('./save/save.route'));

// Expose auth-only router (used by app.js for stricter rate limiting)
router.authOnly = authRoute;

module.exports = router;
