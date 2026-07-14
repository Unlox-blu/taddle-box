// Repository
const gameRepository = require('./game.repository')

// Service
const GameService = require('./game.service')

// Controller
const GameController = require('./game.controller')

// Instantiate Service
const gameService = new GameService({gameRepository})

// Instantiate Controller
const gameController = new GameController({gameService})


module.exports = {gameController, gameService, gameRepository}