// Repository
const mediaRepository = require('./media.repository')

// Service
const MediaService = require('./media.service')

// Controller
const MediaController = require('./media.controller')


// Integration
const storageIntegration = require('../../integrations/storage/storage.service')
const videoIntegration = require('../../integrations/video/video.service')

// Instantiate Service
const mediaService = new MediaService({ 
    mediaRepository,
    storageIntegration,
    videoIntegration
 })

// Instantiate Controller
const mediaController = new MediaController({ mediaService })

// Export controller as default, but also export service and repository for other modules
module.exports = {mediaController, mediaService}