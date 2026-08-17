// Repository
const commentRepository = require('./comment.repository')

// Service
const CommentService = require('./comment.service')

// Controller
const CommentController = require('./comment.controller')

// Dependencies from other modules
// Same cycle-break as feed.container: post.container requires feed.container,
// which this module also requires — pulling postRepository out of
// post.container here would read an empty exports object mid-load. The
// repository file itself is a leaf, so require it directly.
const postRepository = require('../post/post.repository')
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