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

  getActiveSession = async (req, res, next) => {
    try {
      const userId = req.userId;
      const active = await this.gameSvc.getActiveSession({ userId });
      res.json(apiResponse(active, "Active session fetched"));
    } catch (error) {
      next(error);
    }
  };

  getTrendingGames = async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit || '3', 10);
      const games = await this.gameSvc.getTrendingGames({ limit });
      res.json(apiResponse(games, "trending games fetched successfully"));
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
      const game = await this.gameSvc.getGameById({userId, gameId});
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
      const match = await this.gameSvc.getGameMatchById({userId, matchId});
      res.json(apiResponse(match, "matches fetched successfuly"));
    } catch (error) {
      next(error);
    }
  };

  createGameMatch = async (req, res, next) => {
    try {
      const userId = req.userId;
      const matchData = req.body
      const match = await this.gameSvc.createGameMatch({userId, matchData});
      res.status(201).json(apiResponse(match, "matches created successfuly"));
    } catch (error) {
      next(error);
    }
  };

  updateGameMatch = async (req, res, next) => {
    try {
      const userId = req.userId;
      const matchData = req.body
      const match = await this.gameSvc.updateGameMatch({userId, matchData});
      res.json(apiResponse(match, "matches updated successfuly"));
    } catch (error) {
      next(error);
    }
  };

  startGameSession = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { gameId, mode, matchGroupId } = req.body;
      const session = await this.gameSvc.startGameSession({ userId, gameId, mode, matchGroupId });
      res.status(201).json(apiResponse(session, "Session started successfully"));
    } catch (error) {
      next(error);
    }
  };

  completeGameSession = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { sessionId, tapLog, clientNonce } = req.body;
      const result = await this.gameSvc.completeGameSession({ userId, sessionId, tapLog, clientNonce });
      res.json(apiResponse(result, "Session completed successfully"));
    } catch (error) {
      next(error);
    }
  };

	  getGameStats = async (req, res, next) => {
    try {
      const userId = req.userId;
      const gameStats = await this.gameSvc.getGameStats({userId});
      res.json(apiResponse(gameStats, "game stats fetched successfuly"));
    } catch (error) {
      next(error);
    }
	  };

	  getLeaderboard = async (req, res, next) => {
	    try {
	      const { limit, offset, page } = getPaginationParams(req.query);
	      const { leaderboard, total } = await this.gameSvc.getLeaderboard({limit, offset});
	      res.json(apiResponse(leaderboard, "game leaderboard fetched successfuly", paginationMeta(total, page, limit)));
	    } catch (error) {
	      next(error);
	    }
	  };

	  getTournaments = async (req, res, next) => {
    try {
      const userId = req.userId;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (parseInt(req.query.page) - 1) * limit || 0;
      const result = await this.gameSvc.getTournaments({ userId, limit, offset });
      res.json(apiResponse(result.tournaments, "Tournaments fetched successfully", { total: result.total }));
    } catch (error) {
      next(error);
    }
  };

  getTournamentLeaderboard = async (req, res, next) => {
    try {
      const tournamentId = req.params.tournamentId;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (parseInt(req.query.page) - 1) * limit || 0;
      const result = await this.gameSvc.getTournamentLeaderboard({ tournamentId, limit, offset });
      res.json(apiResponse(result.leaderboard, "Tournament leaderboard fetched successfully", { total: result.total }));
    } catch (error) {
      next(error);
    }
  };

  joinTournament = async (req, res, next) => {
	    try {
	      const userId = req.userId;
	      const { tournamentId } = req.params;
	      const tournament = await this.gameSvc.joinTournament({userId, tournamentId});
	      res.json(apiResponse(tournament, "game tournament joined successfuly"));
	    } catch (error) {
	      next(error);
	    }
	  };

	  joinMatchmaking = async (req, res, next) => {
	    try {
	      const userId = req.userId;
	      const matchData = req.body;
	      const result = await this.gameSvc.joinMatchmaking({userId, matchData});
	      res.json(apiResponse(result, "matchmaking updated successfuly"));
	    } catch (error) {
	      next(error);
	    }
	  };

	  inviteMatchmaking = async (req, res, next) => {
	    try {
	      const userId = req.userId;
	      const inviteData = req.body;
	      const result = await this.gameSvc.inviteMatchmaking({userId, inviteData});
	      res.json(apiResponse(result, "matchmaking invite sent successfuly"));
	    } catch (error) {
	      next(error);
	    }
	  };

	  getMatchmakingTicket = async (req, res, next) => {
	    try {
	      const userId = req.userId;
	      const { ticketId } = req.params;
	      const ticket = await this.gameSvc.getMatchmakingTicket({userId, ticketId});
	      res.json(apiResponse(ticket, "matchmaking ticket fetched successfuly"));
	    } catch (error) {
	      next(error);
	    }
	  };

	  cancelMatchmakingTicket = async (req, res, next) => {
	    try {
	      const userId = req.userId;
	      const { ticketId } = req.params;
	      const ticket = await this.gameSvc.cancelMatchmakingTicket({userId, ticketId});
	      res.json(apiResponse(ticket, "matchmaking ticket cancelled successfuly"));
	    } catch (error) {
	      next(error);
	    }
	  };



}



module.exports = GameController;
