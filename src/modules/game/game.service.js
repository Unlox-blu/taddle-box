'use strict';

const { createError } = require('../../utils/error.util');

class GameService {
  constructor({ gameRepository, xpService }) {
    this.gameRepo = gameRepository;
    this.xpSvc = xpService;
  }

  calculateResult({ game, score, duration }) {
    const metadata = game.metadata || {};
    const maxXp = Number(metadata.maxXp || 25);
    const winScore = Number(metadata.winScore || 1);
    const safeScore = Math.max(0, Math.floor(Number(score) || 0));
    const safeDuration = Math.max(0, Math.floor(Number(duration) || 0));

    if (game.slug === 'tap-rush') {
      if (safeDuration < 10 || safeDuration > 35) {
        throw createError('Invalid game duration', 400);
      }
      if (safeScore > 100) {
        throw createError('Invalid game score', 400);
      }
      return {
        score: safeScore,
        duration: safeDuration,
        result: safeScore >= winScore ? 'WIN' : 'LOSS',
        xpEarned: Math.min(maxXp, safeScore > 0 ? 10 + Math.floor((safeScore * maxXp) / 28) : 0),
      };
    }

    if (game.slug === 'memory-grid') {
      if (safeDuration < 1 || safeDuration > 300) {
        throw createError('Invalid game duration', 400);
      }
      if (safeScore > Number(metadata.maxScore || 5)) {
        throw createError('Invalid game score', 400);
      }
      return {
        score: safeScore,
        duration: safeDuration,
        result: safeScore >= winScore ? 'WIN' : 'LOSS',
        xpEarned: Math.min(maxXp, safeScore > 0 ? 8 + Math.floor((safeScore * maxXp) / 6) : 0),
      };
    }

    throw createError('Unsupported game runtime', 400);
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
	        throw createError("Game not found", 404)

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
        throw createError("Match not found", 404)
      if (match.userId !== userId)
        throw createError("Match not found", 404)
      
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
	      if (isGameExist.metadata?.runtime !== 'html5_webview') {
	        throw createError("Unsupported game runtime", 400)
	      }
	      matchData.mode = matchData.mode.toUpperCase()
	      if (['QUICK', 'TOURNAMENT'].includes(matchData.mode)) {
	        throw createError("Use matchmaking endpoint for this mode", 400)
	      }
	      matchData.metadata = {
	        ...(matchData.metadata || {}),
	        runtime: isGameExist.metadata.runtime,
	        startedAt: new Date().toISOString(),
	      }

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
	      if (isMatchExist.userId !== userId)
	        throw createError("Match not found", 404)
	      if (isMatchExist.result)
	        throw createError("Match already completed", 409)

	      const game = await this.gameRepo.findGameById({gameId: isMatchExist.gameId})
	      if(!game)
	        throw createError("Game not found", 404)

	      const calculated = this.calculateResult({
	        game,
	        score: matchData.score,
	        duration: matchData.duration,
	      })

	      matchData = {
	        ...matchData,
	        ...calculated,
	        metadata: {
	          tournamentId: isMatchExist.metadata?.tournamentId,
	          matchGroupId: isMatchExist.metadata?.matchGroupId,
	          opponentUserId: isMatchExist.metadata?.opponentUserId,
	          opponentName: isMatchExist.metadata?.opponentName,
	          completedAt: new Date().toISOString(),
	          clientResult: matchData.result,
	          clientXpEarned: matchData.xpEarned,
	        },
	      }

	      const match = await this.gameRepo.completeGameMatch({matchData})
	      if(!match)
	        throw createError("Match already completed", 409)

	      if (calculated.xpEarned > 0 && this.xpSvc) {
	        await this.xpSvc.creditXP({
	          userId,
	          xp: calculated.xpEarned,
	          transactionType: 'earned',
	          sourceType: `game_match_${match.id}`,
	        })
	      }
	      return match
    } catch (error) {
      throw error;
    }
  }

  async getGameStats({userId}) {
    try {
	      let gameStats = await this.gameRepo.findGameStatsByUserId({userId})
	      if(!gameStats)
	        gameStats = await this.gameRepo.createGameStatsByUserId({userId})
      
      return gameStats
	    } catch (error) {
	      throw error;
	    }
	  }

	  async getLeaderboard({limit, offset}) {
	    try {
	      return await this.gameRepo.findLeaderboard({limit, offset})
	    } catch (error) {
	      throw error
	    }
	  }

	  async getTournaments({userId, limit, offset}) {
	    try {
	      return await this.gameRepo.findTournaments({userId, limit, offset})
	    } catch (error) {
	      throw error
	    }
	  }

	  async joinTournament({userId, tournamentId}) {
	    try {
	      const tournament = await this.gameRepo.findTournamentById({tournamentId, userId})
	      if(!tournament)
	        throw createError("Tournament not found", 404)
	      if (!['ACTIVE', 'UPCOMING'].includes(tournament.status) || new Date(tournament.endsAt) <= new Date())
	        throw createError("Tournament is not open", 400)
	      if (tournament.playerCount >= tournament.maxPlayers && !tournament.isJoined)
	        throw createError("Tournament is full", 409)

	      if (!tournament.isJoined && tournament.entryFeeXP > 0 && this.xpSvc) {
	        await this.xpSvc.debitXP({
	          userId,
	          xp: tournament.entryFeeXP,
	          transactionType: 'spent',
	          sourceType: `game_tournament_${tournament.id}`,
	        })
	      }

	      await this.gameRepo.joinTournament({userId, tournamentId})
	      return await this.gameRepo.findTournamentById({tournamentId, userId})
	    } catch (error) {
	      throw error
	    }
	  }

	  async joinMatchmaking({userId, matchData}) {
	    try {
	      const mode = matchData.mode.toUpperCase()
	      if (!['QUICK', 'TOURNAMENT'].includes(mode))
	        throw createError("Matchmaking supports QUICK and TOURNAMENT only", 400)

	      const game = await this.gameRepo.findGameById({gameId: matchData.gameId})
	      if(!game)
	        throw createError("Game not found", 404)
	      if (game.metadata?.runtime !== 'html5_webview')
	        throw createError("Unsupported game runtime", 400)

	      let tournamentId = matchData.tournamentId || null
	      if (mode === 'TOURNAMENT') {
	        if (!tournamentId)
	          throw createError("Tournament ID is required", 400)
	        const tournament = await this.gameRepo.findTournamentById({tournamentId, userId})
	        if(!tournament)
	          throw createError("Tournament not found", 404)
	        if (tournament.gameId !== game.id)
	          throw createError("Tournament does not belong to this game", 400)
	        await this.joinTournament({userId, tournamentId})
	      } else {
	        tournamentId = null
	      }

	      return await this.gameRepo.joinMatchmaking({userId, game, mode, tournamentId})
	    } catch (error) {
	      throw error
	    }
	  }

	  async getMatchmakingTicket({userId, ticketId}) {
	    try {
	      const ticket = await this.gameRepo.findMatchmakingTicketById({userId, ticketId})
	      if(!ticket)
	        throw createError("Matchmaking ticket not found", 404)

	      return {
	        status: ticket.ticket.status,
	        ...ticket,
	      }
	    } catch (error) {
	      throw error
	    }
	  }

	  async cancelMatchmakingTicket({userId, ticketId}) {
	    try {
	      const ticket = await this.gameRepo.cancelMatchmakingTicket({userId, ticketId})
	      if(!ticket)
	        throw createError("Waiting matchmaking ticket not found", 404)

	      return ticket
	    } catch (error) {
	      throw error
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
