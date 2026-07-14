'use strict';

const { apiResponse } = require('../../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../../utils/pagination.util');

class GameController {
  constructor({ gameService }) {
    this.gameSvc = gameService;
  }

  getGames = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { limit, offset, page } = getPaginationParams(req.query);
      const {games, total} = await this.gameSvc.getGames({userId, limit, offset});
      res.json(apiResponse(games, "games fetched successfuly", paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  };

  searchGames = async (req, res, next) => {
    try {
      const userId = req.userId;
      const {query} = req.query;
      const { limit, offset, page } = getPaginationParams(req.query);
      const {games, total} = await this.gameSvc.searchGames({userId, query, limit, offset,});
      res.json(apiResponse(games, "games fetched successfuly", paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  };

  getGameById = async (req, res, next) => {
    try {
      const userId = req.userId;
      const {gameId} = req.params;
      const {game} = await this.gameSvc.getGameById({userId, gameId});
      res.json(apiResponse(game, "game fetched successfuly"));
    } catch (error) {
      next(error);
    }
  };

  
  getGameMatch = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { limit, offset, page } = getPaginationParams(req.query);
      const {matchs, total} = await this.gameSvc.getGameMatch({userId, limit, offset});
      res.json(apiResponse(matchs, "matches fetched successfuly", paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  };

  getGameMatchById = async (req, res, next) => {
    try {
      const userId = req.userId;
      const {matchId} = req.params
      const {match} = await this.gameSvc.getGameMatchById({userId, matchId});
      res.json(apiResponse(match, "matches fetched successfuly"));
    } catch (error) {
      next(error);
    }
  };

  createGameMatch = async (req, res, next) => {
    try {
      const userId = req.userId;
      const matchData = req.body
      const {match} = await this.gameSvc.createGameMatch({userId, matchData});
      res.status(201).json(apiResponse(match, "matches created successfuly"));
    } catch (error) {
      next(error);
    }
  };

  updateGameMatch = async (req, res, next) => {
    try {
      const userId = req.userId;
      const matchData = req.body
      const {match} = await this.gameSvc.updateGameMatch({userId, matchData});
      res.json(apiResponse(match, "matches updated successfuly"));
    } catch (error) {
      next(error);
    }
  };

}



module.exports = GameController;
