'use strict';

const crypto = require('crypto');
const { createError } = require('../../utils/error.util');

class GameService {
  constructor({ gameRepository, xpService, notificationService, userRepository }) {
    this.gameRepo = gameRepository;
    this.xpSvc = xpService;
    this.notificationSvc = notificationService;
    this.userRepo = userRepository;
  }

  calculateResult({ game, score, duration }) {
    const metadata = game.metadata || {};
    const maxXp = Number(metadata.maxXp || 25);
    const winScore = Number(metadata.winScore || 1);
    const safeScore = Math.max(0, Math.floor(Number(score) || 0));
    const safeDuration = Math.max(0, Math.floor(Number(duration) || 0));

    if (game.slug === 'tap-rush') {
      // Clamp duration to valid range — engine may not report timestamps for bot/reconnect flows
      const clampedDuration = Math.max(10, Math.min(35, safeDuration > 0 ? safeDuration : (Number(metadata.durationSeconds) || 20)));
      if (safeScore > 100) {
        throw createError('Invalid game score', 400);
      }
      return {
        score: safeScore,
        duration: clampedDuration,
        result: safeScore >= winScore ? 'WIN' : 'LOSS',
        xpEarned: Math.min(maxXp, safeScore > 0 ? 10 + Math.floor((safeScore * maxXp) / 28) : 0),
      };
    }

    if (game.slug === 'memory-grid') {
      // Clamp duration to valid range
      const clampedDuration = Math.max(1, Math.min(300, safeDuration > 0 ? safeDuration : 30));
      if (safeScore > Number(metadata.maxScore || 5)) {
        throw createError('Invalid game score', 400);
      }
      return {
        score: safeScore,
        duration: clampedDuration,
        result: safeScore >= winScore ? 'WIN' : 'LOSS',
        xpEarned: Math.min(maxXp, safeScore > 0 ? 8 + Math.floor((safeScore * maxXp) / 6) : 0),
      };
    }
    return {
      score: safeScore,
      duration: safeDuration,
      result: safeScore >= winScore ? 'WIN' : 'LOSS',
      xpEarned: Math.min(maxXp, safeScore > 0 ? 10 + Math.floor((safeScore * maxXp) / 100) : 0),
    };
  }

  async getGames({userId, limit, offset}) {
    try {
      const {games, total} = await this.gameRepo.findManyGames({limit, offset})
      return {games, total}
    } catch (error) {
      throw error;
    }
  }

  async getActiveSession({ userId }) {
    try {
      const active = await this.gameRepo.findActiveSession({ userId });
      if (!active) return null;
      
      const EventStore = require('./engine/EventStore');
      const snap = await EventStore.loadMatchSnapshot(active.match_id);
      let reconnectWindowMs = null;
      if (snap && snap.status === 'PAUSED') {
        const pausedAt = snap.pausedAt || Date.now();
        const elapsed = Date.now() - pausedAt;
        const totalPauseWindow = 60000;
        reconnectWindowMs = Math.max(0, totalPauseWindow - elapsed);
      }

      return {
        sessionId: active.session_id,
        matchId: active.match_id,
        gameId: active.game_id,
        wsToken: active.ws_token,
        mode: active.mode || 'QUICK',
        opponentName: active.opponent_name,
        ticket: { userMatchId: active.match_id, token: active.ws_token },
        reconnectWindowMs,
        game: {
          id: active.game_id,
          name: active.game_name,
          slug: active.game_slug,
          metadata: { runtime: active.match_metadata?.runtime || 'native' }
        }
      };
    } catch (error) {
      throw error;
    }
  }

  async getTrendingGames({ limit }) {
    try {
      const games = await this.gameRepo.getTrendingGames({ limit });
      return games;
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
	      if (!['html5_webview', 'native'].includes(isGameExist.metadata?.runtime)) {
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

	  async getTournamentLeaderboard({tournamentId, limit, offset}) {
	    try {
	      return await this.gameRepo.findTournamentLeaderboard({tournamentId, limit, offset})
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
	          sourceType: `tournament_${tournament.id}`,
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
	      if (!['html5_webview', 'native'].includes(game.metadata?.runtime))
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

	      const result = await this.gameRepo.joinMatchmaking({userId, game, mode, tournamentId});
        try {
          const { getIO } = require('../../sockets/index');
          const io = getIO();
          
          if (result.status === 'MATCHED') {
            for (const p of result.players) {
              if (p.id !== userId && !p.isBot) {
                io.to(`user:${p.id}`).emit('matchmaking:matched', result);
              }
            }
          } else if (result.status === 'WAITING') {
            for (const p of result.players) {
              if (p.id !== userId && !p.isBot) {
                io.to(`user:${p.id}`).emit('matchmaking:lobbyUpdated', result);
              }
            }
          }
        } catch (e) {
          console.error('Failed to emit matchmaking events', e);
        }
        return result;
	    } catch (error) {
	      throw error
	    }
	  }

	  async inviteMatchmaking({userId, inviteData}) {
	    try {
	      const { opponentId, gameId, matchGroupId } = inviteData;
	      const game = await this.gameRepo.findGameById({gameId});
	      if(!game)
	        throw createError("Game not found", 404);

	      const sender = await this.userRepo.findById(userId);
	      if(!sender)
	        throw createError("User not found", 404);

	      await this.notificationSvc.create({
	        recipientId: opponentId,
	        senderId: userId,
	        type: 'GAME_INVITE',
	        title: 'Game Invite! 🎮',
	        message: `${sender.name || "A friend"} invited you to play ${game.name}!|${matchGroupId}`,
	        resourceType: 'game',
	        resourceId: gameId,
	      });

	      return { success: true };
	    } catch (error) {
	      throw error;
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

        if (ticket.lobbyState) {
          try {
            const { getIO } = require('../../sockets/index');
            const io = getIO();
            for (const p of ticket.lobbyState.players) {
              if (p.id !== userId && !p.isBot) {
                io.to(`user:${p.id}`).emit('matchmaking:lobbyUpdated', ticket.lobbyState);
              }
            }
          } catch (e) {
            console.error('Failed to emit matchmaking events', e);
          }
        }

	      return ticket
	    } catch (error) {
	      throw error
	    }
	  }

	  async fillMatchmakingLobby({userId, ticketId}) {
	    try {
	      const result = await this.gameRepo.fillMatchmakingLobby({userId, ticketId})
	      if(!result)
	        throw createError("Failed to fill lobby", 500)

        if (result.status === 'MATCHED') {
          try {
            const { getIO } = require('../../sockets/index');
            const io = getIO();
            for (const p of result.players) {
              if (p.id !== userId && !p.isBot) {
                io.to(`user:${p.id}`).emit('matchmaking:matched', result);
              }
            }
          } catch (e) {
            console.error('Failed to emit matchmaking events', e);
          }
        }
	      return result
	    } catch (error) {
	      throw error
	    }
	  }



  async startGameSession({ userId, gameId, mode, matchGroupId }) {
    try {
      const game = await this.gameRepo.findGameById({ gameId });
      if (!game) throw createError("Game not found", 404);

      if (mode === 'bot' || mode === 'BOT') {
        const activeSession = await this.gameRepo.findActiveBotSession({ userId, gameId });
        if (activeSession) {
          return {
             sessionId: activeSession.id,
             wsToken: activeSession.ws_token,
             expiresAt: new Date(Date.now() + 60*60*1000).toISOString(),
             ticket: { userMatchId: activeSession.match_id, token: activeSession.ws_token }
          };
        }
      }

      // Deduct XP (tournaments are paid upfront)
      if (mode !== 'TOURNAMENT' && mode !== 'tournament') {
        const entryFeeMap = {
          'tap-rush': 5, 'memory-grid': 5, 'scribble': 10,
          'ludo': 5, 'snake-ladder': 10, 'chess': 15, 'word-rush': 5
        };
        const entryFee = entryFeeMap[game.slug] || 5;
        await this.xpSvc.debitXP({
          userId, xp: entryFee,
          transactionType: 'spent', sourceType: `session_${game.slug}`
        });
      }

      const seed = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins
      
      const wsToken = crypto.randomBytes(16).toString('hex');
      let effectiveMatchId = matchGroupId;
      if (!effectiveMatchId) {
         effectiveMatchId = require('crypto').randomUUID(); 
      }

      await this.gameRepo.setupMatchSession({ matchId: effectiveMatchId, gameId, userId, wsToken, mode, gameSlug: game.slug });

      const session = await this.gameRepo.createGameSession({
        sessionData: { 
          userId, 
          gameId, 
          seed, 
          expiresAt,
          metadata: { mode: mode || 'QUICK', matchGroupId: effectiveMatchId }
        }
      });

      return {
        sessionId: session.id,
        wsToken,
        expiresAt: session.expires_at,
        ticket: { userMatchId: effectiveMatchId, token: wsToken }
      };
    } catch (error) {
      throw error;
    }
  }

  async completeGameSession({ userId, sessionId, tapLog, clientNonce }) {
    try {
      const session = await this.gameRepo.findGameSessionById({ sessionId });
      if (!session) throw createError("Session not found", 404);
      if (session.user_id !== userId) throw createError("Unauthorized", 403);
      if (session.status !== 'ACTIVE') throw createError("Session already completed or cancelled", 400);
      if (new Date(session.expires_at) < new Date()) throw createError("Session expired", 400);

      const game = await this.gameRepo.findGameById({ gameId: session.game_id });
      if (!game) throw createError("Game not found", 404);

      let rawScore = 0;
      let duration = 0;
      let engineResult = null;

      // Native Runtime Resolution
      const { MatchManager, MATCH_STATES } = require('./engine/MatchManager');
      const matchGroupId = session.metadata?.matchGroupId || session.id;
      const { state: matchState } = await MatchManager.loadOrInitializeMatch(matchGroupId, game.slug, session.metadata || {});
      
      if (matchState) {
         if (game.slug === 'chess' || game.slug === 'ludo' || game.slug === 'snake-ladder') {
            if (matchState.status === MATCH_STATES.FINISHED) {
               rawScore = matchState.pluginState?.winner === userId ? (game.metadata?.winScore || 1) : 0;
               duration = 60;
            } else {
               throw createError("Match is not finished yet", 400);
            }
         } else {
            // For realtime games: read score from engine state (player or bot winner result)
            rawScore = matchState.pluginState?.scores?.[userId] || 0;
            // If match ended by bot winning (player score is 0), check if player actually lost
            if (rawScore === 0 && matchState.status === MATCH_STATES.FINISHED) {
               // Player finished with 0 — keep as LOSS (score stays 0)
            }
            if (matchState.pluginState?.startedAt && matchState.pluginState?.finishedAt) {
                duration = Math.floor((matchState.pluginState.finishedAt - matchState.pluginState.startedAt) / 1000);
            } else if (matchState.pluginState?.startedAt) {
                // Game started but finishedAt not set (e.g. abrupt end)
                duration = Math.floor((Date.now() - matchState.pluginState.startedAt) / 1000);
            } else {
                duration = Number(game.metadata?.durationSeconds) || 60;
            }
         }
         engineResult = matchState.pluginState;
      } else {
         // matchState unavailable (Redis cleaned up after game ended) — use game defaults
         duration = Number(game.metadata?.durationSeconds) || 60;
      }

      let calculated = this.calculateResult({ game, score: rawScore, duration });
      
      const isBotMode = session.metadata?.mode === 'bot';
      if (isBotMode) {
        calculated.xpEarned = 0; // No XP for bot practice
        
        await this.gameRepo.updateGameSessionStatus({
          sessionId, status: 'COMPLETED', completedAt: new Date().toISOString()
        });

        await this.gameRepo.recordMatchHistory({
          userId, gameId: game.id, mode: session.metadata?.mode, result: calculated.result, 
          score: calculated.score, duration, xpEarned: calculated.xpEarned
        });

        const ledgerEntry = await this.gameRepo.createRewardLedgerEntry({
          ledgerData: {
            sessionId, userId, gameId: game.id,
            validatedScore: calculated.score,
            xpAwarded: calculated.xpEarned,
            deviceId: null, ipAddress: null
          }
        });

        return {
          result: calculated.result, score: calculated.score,
          xpEarned: calculated.xpEarned, ledgerId: ledgerEntry.id
        };
      }
      
      // PVP Resolution (Opponent SSOT)
      // matchGroupId already declared above
      
      // Save the score but do not credit XP yet
      await this.gameRepo.updateGameSessionStatus({
        sessionId, status: 'PENDING', completedAt: new Date().toISOString()
      });
      
      const ledgerEntry = await this.gameRepo.createRewardLedgerEntry({
        ledgerData: {
          sessionId, userId, gameId: game.id,
          validatedScore: calculated.score,
          xpAwarded: 0, // Pending
          deviceId: null, ipAddress: null
        }
      });

      // Check if opponent is already done (has a PENDING or COMPLETED session in the same match group)
      const opponentSession = await this.gameRepo.findOpponentSessionByMatchGroup({ matchGroupId, excludeUserId: userId });
      
      if (opponentSession && (opponentSession.status === 'PENDING' || opponentSession.status === 'COMPLETED')) {
        // Opponent is done! We can resolve the match NOW.
        // Compare scores
        const myScore = calculated.score;
        const opScore = opponentSession.validated_score || 0; // We need to fetch this from ledger ideally
        
        let myResult = myScore > opScore ? 'WIN' : myScore < opScore ? 'LOSS' : 'DRAW';
        let myXp = myResult === 'WIN' ? calculated.xpEarned : 0;
        
        // In a real app we'd update both ledgers and wallets here and emit WS events.
        // For now, we instantly resolve the current player.
        await this.gameRepo.updateGameSessionStatus({
          sessionId, status: 'COMPLETED', completedAt: new Date().toISOString()
        });
        
        await this.gameRepo.recordMatchHistory({
          userId, gameId: game.id, mode: session.metadata?.mode, result: myResult,
          score: myScore, duration, xpEarned: myXp
        });
        
        if (myXp > 0 && this.xpSvc) {
          await this.xpSvc.creditXP({
            userId, xp: myXp,
            transactionType: 'earned', sourceType: `game_session_${sessionId}`
          });
        }
        
        // Let the opponent know the final outcome as well
        const opResult = opScore > myScore ? 'WIN' : opScore < myScore ? 'LOSS' : 'DRAW';
        const opXp = opResult === 'WIN' ? calculated.xpEarned : 0;
        
        // We update opponent ledger in the background
        this.gameRepo.updateGameSessionStatus({
          sessionId: opponentSession.id, status: 'COMPLETED', completedAt: new Date().toISOString()
        }).catch(console.error);
        
        await this.gameRepo.recordMatchHistory({
          userId: opponentSession.user_id, gameId: game.id, mode: session.metadata?.mode, result: opResult,
          score: opScore, duration, xpEarned: opXp
        });

        if (opXp > 0 && this.xpSvc) {
          this.xpSvc.creditXP({
            userId: opponentSession.user_id, xp: opXp,
            transactionType: 'earned', sourceType: `game_session_${opponentSession.id}`
          }).catch(console.error);
        }

        const { emitNotification } = require('../../sockets/notification.socket');
        emitNotification(opponentSession.user_id, {
          type: 'MATCH_RESOLVED',
          title: 'Match Resolved',
          message: opResult === 'WIN' ? 'You won!' : 'You lost.',
          payload: { result: opResult, score: opScore, xpEarned: opXp }
        });

        return {
          result: myResult, score: myScore,
          xpEarned: myXp, ledgerId: ledgerEntry.id
        };
      } else {
        // Opponent is not done. Enter PENDING state.
        return {
          result: 'PENDING', score: calculated.score,
          xpEarned: 0, ledgerId: ledgerEntry.id
        };
      }
    } catch (error) {
      throw error;
    }
  }
}

module.exports = GameService;
