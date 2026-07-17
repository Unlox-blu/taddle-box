'use strict';

const redis = require('../../config/redis');
const { createError } = require('../../utils/error.util');

class GameService {
  constructor({ gameRepository }) {
    this.gameRepo = gameRepository;
  }

  async getGames({userId, limit, offset}) {
    try {
      const {games, total} = await this.gameRepo.findManyGames({limit, offset})
      return {games, total}
    } catch (error) {
      throw error;
    }
  }

  async searchGames({userId, query, limit, offset,}) {
    try {
      query = query ? query : ''
      const {games, total} = await this.gameRepo.searchGames({query, limit, offset})
      return {games, total}
    } catch (error) {
      throw error;
    }
  }

  async getGameById({userId, gameId}) {
    try {
      const game = await this.gameRepo.findGameById({gameId})
      if(!game)
        createError("Game not found", 404)

      return game
    } catch (error) {
      throw error;
    }
  }

  async getGameMatch({userId, limit, offset}) {
    try {
      const {matchs, total} = await this.gameRepo.findManyGameMatshs({userId, limit, offset})
      return {matchs, total}
    } catch (error) {
      throw error;
    }
  }

  async getGameMatchById({userId, matchId}) {
    try {
      const match = await this.gameRepo.findGameMatchById({matchId})
      if(!match)
        createError("Match not found", 404)
      
      return match
    } catch (error) {
      throw error;
    }
  }

  async createGameMatch({userId, matchData}) {
    try {
      matchData.userId = userId
      const {gameId} = matchData
      const isGameExist = await this.gameRepo.findGameById({gameId})
      if(!isGameExist)
        throw createError("Game not found", 404)

      const match = await this.gameRepo.createGameMatche({matchData}) 
      return match
    } catch (error) {
      throw error;
    }
  }

  async updateGameMatch({userId, matchData}) {
    try {
      matchData.userId = userId
      const {matchId} = matchData
      const isMatchExist = await this.gameRepo.findGameMatchById({matchId})
      if(!isMatchExist)
        throw createError("Match not found", 404)

      const match = await this.gameRepo.updateGameMatcheByMatchId({matchData})
      return match
    } catch (error) {
      throw error;
    }
  }

  async getGameStats({userId}) {
    try {
      const gameStats = await this.gameRepo.findGameStatsByUserId({userId})
      if(!gameStats)
        throw createError("game Stats not found", 404)
      
      return gameStats
    } catch (error) {
      throw error;
    }
  }

  async createGameStats({userId}) {
    try {
      const isGameStatsExixt = await this.gameRepo.findGameStatsByUserId({userId})
      if(isGameStatsExixt)
        throw createError("Game Stats already exist", 409)

      const gameStats = await this.gameRepo.createGameStatsByUserId({userId})

      return gameStats
    } catch (error) {
      throw error;
    }
  }
}

module.exports = GameService;
