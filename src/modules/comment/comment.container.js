// Repository
const commentRepository = require('./comment.repository')

// Service
const CommentService = require('./comment.service')

// Controller
const CommentController = require('./comment.controller')

// Dependencies from other modules
const {postRepository} = require('../post/post.container')
const {userRepository, followerRepository} = require('../user/user.container')
const {notificationService} = require('../notification/notification.container')
const {feedService} = require('../feed/feed.container')
const {communityRepository} = require('../community/community.container')


// Instantiate Service
const commentService = new CommentService({
  commentRepository,
  postRepository,
  userRepository,
  followerRepository,
  notificationService,
  feedService,
  communityRepository,
})

// Instantiate Controller
const commentController = new CommentController({ commentService })

// Export controller as default, but also export service and repository for other modules
module.exports = {commentController, commentService}