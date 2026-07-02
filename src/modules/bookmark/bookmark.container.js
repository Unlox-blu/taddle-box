// Repository
const bookmarkRepository = require('./bookmark.repository')

// Service
const BookmarkService = require('./bookmark.service')

// Controller
const BookmarkController = require('./bookmark.controller')


// Instantiate Service
const bookmarkService = new BookmarkService({ bookmarkRepository })

// Instantiate Controller
const bookmarkController = new BookmarkController({ bookmarkService })

// Export controller as default, but also export service and repository for other modules
module.exports = {bookmarkController, bookmarkService, bookmarkRepository}
