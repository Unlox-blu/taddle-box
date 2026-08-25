'use strict';

// ─── src/routes/index.js ─────────────────────────────────────────────────────
const router   = require('express').Router();
const authRoute = require('./auth.route');

// Mount all domain routes under /api/v1
router.use('/auth',          require('./auth.route'));
router.use('/users',         require('./user.route'));
router.use('/posts',         require('./post.route'));
router.use('/communities',   require('./community.route'));
router.use('/comments',      require('./comment.route'));
router.use('/events',        require('./event.route'));
router.use('/payments',      require('./payment.route'));
router.use('/task',          require('./task.route'));
router.use('/wallet',        require('./wallet.route'));
router.use('/xp',            require('./xp.route'));
router.use('/feed',          require('./feed.route'));
router.use('/notifications', require('./notification.route'));
router.use('/media',         require('./media.route'));
router.use('/push-notification', require('./clientRegistry.route'));
router.use('/search',        require('./search.route'));
router.use('/share',         require('./share.route'));
router.use('/streak',        require('./streak.route'));
router.use('/settings',      require('./settings.route'));
router.use('/highlight',     require('./highlight.route'));
router.use('/active-status', require('./activestatus.route'));
router.use('/app-config',    require('./appconfig.route'));
router.use('/app-releases',  require('./appreleases.route'));
router.use('/bookmark',      require('./bookmark.route'));
router.use('/chat',          require('./chat.route'));
router.use('/save',          require('./save.route'));
router.use('/game',          require('./game.route'));
router.use('/game',          require('./game.replay.route'));
router.use('/leaderboards',  require('./leaderboard.route'));

// Expose auth-only router (used by app.js for stricter rate limiting)
router.authOnly = authRoute;

module.exports = router;
