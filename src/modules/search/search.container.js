// Repository
const searchRepository = require('./search.repository')

// Service
const SearchService = require('./search.service')

// Controller
const SearchController = require('./search.controller')

// Dependencies from other modules


// Instantiate Service
const searchService = new SearchService({searchRepository})

// Instantiate Controller
const searchController = new SearchController({ searchService })

// Export controller as default, but also export service and repository for other modules
module.exports = {searchController, searchService}