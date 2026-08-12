// Repository
const eventRepository = require('./event.repository')

// Service
const EventService = require('./event.service')

// Controller
const EventController = require('./event.controller')

// Dependencies from other modules
const {walletRepository} = require('../wallet/wallet.container')
const {userRepository} = require('../user/user.container')
const {saveRepository} = require('../save/save.container')
const {xpService} = require('../xp/xp.container')



// Instantiate Service
const eventService = new EventService({
  eventRepository,
  walletRepository,
  userRepository,
  saveRepository,
  xpService,
})

// Instantiate Controller
const eventController = new EventController({ eventService })


module.exports = {eventController, eventService, eventRepository}