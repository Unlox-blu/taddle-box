// Repository
const communityRepository = require('./community.repository')

// Service
const CommunityService = require('./community.service')

// Controller
const CommunityController = require('./community.controller')

// Dependencies from other modules
const {postService} = require('../post/post.container')
const {userRepository} = require('../user/user.container')
const {mediaService} = require('../media/media.container')



// Instantiate Service
const communityService = new CommunityService({ 
  communityRepository, 
  postService,
  userRepository,
  mediaService
})

// Instantiate Controller
const communityController = new CommunityController({ communityService })

// Export controller as default, but also export service and repository for other modules
module.exports = {communityController, communityService, communityRepository}