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
      const {games, total} = await this.gameRepo.searchGames({query, limit, offset})
      return {games, total}
    } catch (error) {
      throw error;
    }
  }

  async getGameById({userId, gameId}) {
    try {
      const {game} = await this.gameRepo.findGameById({gameId})
      return {game}
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
      const {match} = await this.gameRepo.findGameMatchById({matchId})
      return {match}
    } catch (error) {
      throw error;
    }
  }

  async createGameMatch({userId, matchData}) {
    try {
      matchData.userId = userId
      const {match} = await this.gameRepo.createGameMatche({matchData})
      return {match}
    } catch (error) {
      throw error;
    }
  }

  async updateGameMatch({userId, matchData}) {
    try {
      matchData.userId = userId
      const {match} = await this.gameRepo.updateGameMatcheByMatchId({matchData})
      return {match}
    } catch (error) {
      throw error;
    }
  }
}

module.exports = GameService;
