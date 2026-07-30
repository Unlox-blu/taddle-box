// Repository
const feedRepository = require('./feed.repository')

// Service
const FeedService = require('./feed.service')

// Controller
const FeedController = require('./feed.controller')

// Dependencies from other modules
const {postRepository} = require('../post/post.container')
const {followerRepository} = require('../user/user.container')
const {xpService} = require('../xp/xp.container')



// Instantiate Service
const feedService = new FeedService({ 
  feedRepository, 
  postRepository,
  followerRepository,
  xpService,
})

// Instantiate Controller
const feedController = new FeedController({ feedService })

// Export controller as default, but also export service and repository for other modules
module.exports = {feedController, feedService}
