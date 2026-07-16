// Repository
const walletRepository = require('./wallet.repository')
const xpRepository = require('../xp/xp.repository')

// Service
const WalletService = require('./wallet.service')

// Controller
const WalletController = require('./wallet.controller')



// Instantiate Service
const walletService = new WalletService({ 
  walletRepository,
  xpRepository
})

// Instantiate Controller
const walletController = new WalletController({ walletService })


module.exports = {walletController, walletService, walletRepository}