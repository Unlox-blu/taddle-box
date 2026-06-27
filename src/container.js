'use strict';

// Repositories
const verifyEmailRepository = require('./repositories/verifyemail.repository')
const followerRepository = require('./repositories/followers.repository')
const userRepository = require('./repositories/user.repository');
const postRepository = require('./repositories/post.repository');
const bookmarkRepository = require('./repositories/bookmark.repository')
const saveRepository = require('./repositories/save.repository')
const communityRepository = require('./repositories/community.repository');
const commentRepository = require('./repositories/comment.repository');
const eventRepository = require('./repositories/event.repository');
const taskRepository = require('./repositories/task.repository');
const walletRepository = require('./repositories/wallet.repository');
const xpRepository = require('./repositories/xp.repository');
const notificationRepository = require('./repositories/notification.repository');
const feedRepository = require('./repositories/feed.repository');
const mediaRepository = require('./repositories/media.repository');
const streakRepository = require('./repositories/streak.repository')
const settingsRepository = require('./repositories/settings.repository')
const highlightRepository = require('./repositories/highlight.repository')
const activeStatusRepository = require('./repositories/activestatus.repository')

// Integrations
const emailIntegration = require('./integrations/email/email.service');
const storageIntegration = require('./integrations/storage/storage.service');
const videoIntegration = require('./integrations/video/video.service');
const paymentIntegration = require('./integrations/payment/payment.service');
const googleIntegration = require('./integrations/oauth/google.service');

// Business Logic Services
const AuthService = require('./services/auth.service');
const UserService = require('./services/user.service');
const PostService = require('./services/post.service');
const CommunityService = require('./services/community.service');
const CommentService = require('./services/comment.service');
const EventService = require('./services/event.service');
const TaskService = require('./services/task.service');
const WalletService = require('./services/wallet.service');
const XPService = require('./services/xp.service');
const FeedService = require('./services/feed.service');
const NotificationService = require('./services/notification.service');
const MediaService = require('./services/media.service');
const SearchService = require('./services/search.service')
const StreakService = require('./services/streak.service')
const SettingsService = require('./services/settings.service')
const HighlightService = require('./services/highlight.service')
const ActiveStatusService = require('./services/activestatus.service')

// Controllers
const AuthController = require('./controllers/auth.controller');
const UserController = require('./controllers/user.controller');
const PostController = require('./controllers/post.controller');
const CommunityController = require('./controllers/community.controller');
const CommentController = require('./controllers/comment.controller');
const EventController = require('./controllers/event.controller');
const TaskController = require('./controllers/task.controller');
const WalletController = require('./controllers/wallet.controller');
const XPController = require('./controllers/xp.controller');
const FeedController = require('./controllers/feed.controller');
const NotificationController = require('./controllers/notification.controller');
const MediaController = require('./controllers/media.controller');
const SearchController = require('./controllers/search.controller')
const StreakController = require('./controllers/streak.controller')
const SettingsController = require('./controllers/settings.controller')
const HighlightController = require('./controllers/highlight.controller')
const ActiveStatusController = require('./controllers/activestatus.controller')

// Instantiate Services

const feedService = new FeedService({
  feedRepository, postRepository, followerRepository
});

const xpService = new XPService({
  xpRepository,
});

const taskService = new TaskService({
  taskRepository, xpService, 
});

const settingsService = new SettingsService({
  settingsRepository, userRepository
})

const activeStatusService = new ActiveStatusService({
  activeStatusRepository
})


const authService = new AuthService({
  verifyEmailRepository, userRepository, 
  walletRepository, xpRepository,  emailIntegration, 
  googleIntegration, taskService, settingsRepository
});

const userService = new UserService({
  userRepository, bookmarkRepository, saveRepository, storageIntegration,
  followerRepository, taskService
});

const notificationService = new NotificationService({
  notificationRepository,
});

const postService = new PostService({
  postRepository, communityRepository, userRepository, followerRepository,
  bookmarkRepository, notificationService, feedService, taskService
});

const communityService = new CommunityService({
  communityRepository, postRepository, userRepository, 
  notificationService
});

const commentService = new CommentService({
  commentRepository, postRepository, userRepository,  followerRepository,
  notificationService, feedService, communityRepository
});

const eventService = new EventService({
  eventRepository, walletRepository, userRepository, saveRepository, paymentIntegration, notificationService,
});

const walletService = new WalletService({
  walletRepository, paymentIntegration, notificationService,
});

const mediaService = new MediaService({
  mediaRepository, storageIntegration, videoIntegration
});

const searchService = new SearchService({
  userRepository, postRepository, communityRepository, eventRepository
})

const streakService = new StreakService({
  streakRepository, taskService
})

const highlightService = new HighlightService({
  highlightRepository
})


// Instantiate Controllers
const authController = new AuthController({ authService });
const userController = new UserController({ userService });
const postController = new PostController({ postService });
const communityController = new CommunityController({ communityService });
const commentController = new CommentController({ commentService });
const eventController = new EventController({ eventService });
const taskController = new TaskController({ taskService });
const walletController = new WalletController({ walletService });
const xpController = new XPController({ xpService });
const feedController = new FeedController({ feedService });
const notificationController = new NotificationController({ notificationService });
const mediaController = new MediaController({ mediaService });
const searchController = new SearchController({searchService})
const streakController = new StreakController({ streakService })
const settingsController = new SettingsController({ settingsService })
const highlightController = new HighlightController({ highlightService })
const activeStatusController = new ActiveStatusController({ activeStatusService })

module.exports = {
  authController,
  userController,
  postController,
  communityController,
  commentController,
  eventController,
  taskController,
  walletController,
  xpController,
  feedController,
  notificationController,
  mediaController,
  searchController,
  streakController,
  settingsController,
  highlightController,
  activeStatusController,
};
