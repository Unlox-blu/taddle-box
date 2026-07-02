// Repository
const highlightRepository = require('./highlight.repository')

// Service
const HighlightService = require('./highlight.service')

// Controller
const HighlightController = require('./highlight.controller')



// Instantiate Service
const highlightService = new HighlightService({ highlightRepository })

// Instantiate Controller
const highlightController = new HighlightController({ highlightService })

module.exports = {highlightController}