// Repository
const feedRepository = require('./feed.repository')

// Service
const FeedService = require('./feed.service')

// Controller
const FeedController = require('./feed.controller')

// Dependencies from other modules
// Require the post REPOSITORY directly, not post.container: post.container
// requires feed.container for its feedService, so pulling postRepository from
// it here would create a circular require (feed.container → post.container →
// feed.container). At load time post.container's exports are still empty, so
// postRepository would resolve to undefined and Node would print a
// circular-dependency warning. The repository file is a leaf (pool + model),
// so requiring it breaks the cycle and hands the same cached instance over.
const postRepository = require('../post/post.repository')
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
