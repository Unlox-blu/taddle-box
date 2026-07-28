// Repository
const gameRepository = require('./game.repository')
const { xpService } = require('../xp/xp.container')

// Service
const GameService = require('./game.service')

// Controller
const GameController = require('./game.controller')

// Instantiate Service
const gameService = new GameService({gameRepository, xpService})

// Instantiate Controller
const gameController = new GameController({gameService})


module.exports = {gameController, gameService, gameRepository}
