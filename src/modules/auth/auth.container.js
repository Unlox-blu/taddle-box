// Repository
const authUserRepository = require('./authuser.repository')
const verifyEmailRepository = require('./verifyemail.repository')

// Service
const AuthService = require('./auth.service')

// Controller
const AuthController = require('./auth.controller')

// Dependencies from other modules
const {walletService} = require('../wallet/wallet.container')
const {xpService} = require('../xp/xp.container')
const {taskService} = require('../task/task.container') 
const {activeStatusService} = require('../activestatus/activestatus.container')
const mediaRepository = require('../media/media.repository')

// Integrations
const emailIntegration = require('../../integrations/email/email.service')
const googleIntegration = require('../../integrations/oauth/google.service')
const storageIntegration = require('../../integrations/storage/storage.service')


// Instantiate Service
const authService = new AuthService({
  authUserRepository,
  verifyEmailRepository,
  walletService,
  xpService,
  taskService,
  activeStatusService,
  mediaRepository,
  storageIntegration,
})

// Instantiate Controller
const authController = new AuthController({ authService })

// Export controller as default, but also export service and repository for other modules
module.exports = {authController}
