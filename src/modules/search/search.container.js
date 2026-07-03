// Repository
const searchRepository = require('./search.repository')

// Service
const SearchService = require('./search.service')

// Controller
const SearchController = require('./search.controller')

// Dependencies from other modules
const {userRepository} = require('../user/user.container')
const {postRepository} = require('../post/post.container')
const {communityRepository} = require('../community/community.container')
const {eventRepository} = require('../event/event.container')


// Instantiate Service
const searchService = new SearchService({userRepository, postRepository, communityRepository, eventRepository})

// Instantiate Controller
const searchController = new SearchController({ searchService })

// Export controller as default, but also export service and repository for other modules
module.exports = {searchController}