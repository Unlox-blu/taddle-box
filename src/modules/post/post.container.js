// Repository
const postRepository = require('./post.repository')

// Service
const PostService = require('./post.service')

// Controller
const PostController = require('./post.controller')

// Dependencies from other modules
const communityRepository = require('../community/community.repository')
const {userRepository, followerRepository} = require('../user/user.container')
const {bookmarkRepository} = require('../bookmark/bookmark.container')
const {feedService} = require('../feed/feed.container')
const {taskService} = require('../task/task.container')
const {notificationService} = require('../notification/notification.container')


// Instantiate Service
const postService = new PostService({
  postRepository,
  communityRepository,
  feedService,
  taskService,
  userRepository,
  followerRepository,
  bookmarkRepository,
  notificationService,
})
// Instantiate Controller
const postController = new PostController({ postService })


// Export controller as default, but also export service and repository for other modules
module.exports = {postController, postService, postRepository}