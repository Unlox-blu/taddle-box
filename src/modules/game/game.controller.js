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

	  cancelMatchmaking = async (req, res, next) => {
	    try {
	      const userId = req.userId;
	      const result = await this.gameSvc.cancelMatchmaking(userId);
	      res.json(apiResponse(result, "matchmaking cancelled successfuly"));
	    } catch (error) {
	      next(error);
	    }
	  };

	  // --- Resource-Oriented Lobby Endpoints ---

	  getLobby = async (req, res, next) => {
	    try {
	      const { lobbyId } = req.params;
	      const result = await this.gameSvc.getLobby({ userId: req.userId, lobbyId });
	      res.json(apiResponse(result, "Lobby fetched successfully"));
	    } catch (error) {
	      next(error);
	    }
	  };

	  updateLobby = async (req, res, next) => {
	    try {
	      const { lobbyId } = req.params;
	      const result = await this.gameSvc.updateLobby({ userId: req.userId, lobbyId, updates: req.body });
	      res.json(apiResponse(result, "Lobby updated successfully"));
	    } catch (error) {
	      next(error);
	    }
	  };

	  deleteLobby = async (req, res, next) => {
	    try {
	      const { lobbyId } = req.params;
	      const result = await this.gameSvc.deleteLobby({ userId: req.userId, lobbyId });
	      res.json(apiResponse(result, "Lobby deleted successfully"));
	    } catch (error) {
	      next(error);
	    }
	  };

	  joinLobbyByCode = async (req, res, next) => {
	    try {
	      const result = await this.gameSvc.joinLobbyByCode({ userId: req.userId, inviteCode: req.body.inviteCode });
	      res.json(apiResponse(result, "Joined lobby successfully"));
	    } catch (error) {
	      next(error);
	    }
	  };

	  getLobbyPlayers = async (req, res, next) => {
	    try {
	      const { lobbyId } = req.params;
	      const result = await this.gameSvc.getLobbyPlayers({ userId: req.userId, lobbyId });
	      res.json(apiResponse(result, "Lobby players fetched successfully"));
	    } catch (error) {
	      next(error);
	    }
	  };

	  updateLobbyPlayer = async (req, res, next) => {
	    try {
	      const { lobbyId, playerId } = req.params;
	      const result = await this.gameSvc.updateLobbyPlayer({ userId: req.userId, lobbyId, targetUserId: playerId, updates: req.body });
	      res.json(apiResponse(result, "Lobby player updated successfully"));
	    } catch (error) {
	      next(error);
	    }
	  };

	  removeLobbyPlayer = async (req, res, next) => {
	    try {
	      const { lobbyId, playerId } = req.params;
	      const result = await this.gameSvc.removeLobbyPlayer({ userId: req.userId, lobbyId, targetUserId: playerId });
	      res.json(apiResponse(result, "Player removed from lobby successfully"));
	    } catch (error) {
	      next(error);
	    }
	  };

	  inviteLobbyPlayer = async (req, res, next) => {
	    try {
	      const { lobbyId } = req.params;
	      const result = await this.gameSvc.inviteLobbyPlayer({ userId: req.userId, lobbyId, opponentId: req.body.opponentId });
	      res.json(apiResponse(result, "Invite sent successfully"));
	    } catch (error) {
	      next(error);
	    }
	  };

	  shrinkLobby = async (req, res, next) => {
	    try {
	      const { lobbyId } = req.params;
	      const result = await this.gameSvc.shrinkLobby({ userId: req.userId, lobbyId });
	      res.json(apiResponse(result, "Match started early successfully"));
	    } catch (error) {
	      next(error);
	    }
	  };

	  fillLobbyBots = async (req, res, next) => {
	    try {
	      const { lobbyId } = req.params;
	      const result = await this.gameSvc.fillLobbyBots({ userId: req.userId, lobbyId });
	      res.json(apiResponse(result, "Lobby filled with bots"));
	    } catch (error) {
	      next(error);
	    }
	  };

	  continueLobby = async (req, res, next) => {
	    try {
	      const { lobbyId } = req.params;
	      const result = await this.gameSvc.continueLobby({ userId: req.userId, lobbyId });
	      res.json(apiResponse(result, "Timeout extended successfully"));
	    } catch (error) {
	      next(error);
	    }
	  };

	  startLobby = async (req, res, next) => {
	    try {
	      const { lobbyId } = req.params;
	      const result = await this.gameSvc.startLobby({ userId: req.userId, lobbyId });
	      res.json(apiResponse(result, "Lobby started successfully"));
	    } catch (error) {
	      next(error);
	    }
	  };
}



module.exports = GameController;
