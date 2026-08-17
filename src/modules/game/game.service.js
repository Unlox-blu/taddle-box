'use strict';

const crypto = require('crypto');
const { createError } = require('../../utils/error.util');
const gameModel = require('./game.model');

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

      // Lowercase so it matches the frontend's session mode convention
      // ('auto' | 'custom' | 'tournament' | 'practice') used for labels/rematch.
      const normalizedMode = String(active.mode || 'AUTO').toLowerCase();

      // Rejoin needs the FULL player roster (names + avatars + levels) so
      // in-game boards show real profiles and level badges instead of generic
      // "P1/P2" labels — the fresh-match flow gets these from the matchmaking
      // response, but a rejoin path only has this endpoint. The snapshots live
      // in game_matches.metadata.playerSnapshots (written by the lobby fill).
      const matchMeta = active.match_metadata || {};
      const snapshots = Array.isArray(matchMeta.playerSnapshots)
        ? matchMeta.playerSnapshots
        : [];
      const mySnap = snapshots.find(
        (p) => String(p.id || p.userId) === String(userId)
      );
      const players = snapshots
        .filter((p) => String(p.id || p.userId) !== String(userId))
        .map((p) => ({
          id: p.id || p.userId,
          name: p.displayName || p.username || 'Opponent',
          username: p.username,
          avatar: p.avatar || p.avatarUrl,
          team: p.team,
          seat: p.seat,
          level: p.level ?? (typeof p.xp === 'number' ? Math.floor(p.xp / 1000) + 1 : undefined),
        }));

      // Legacy matches created before playerSnapshots existed have no roster —
      // rebuild names + avatars + levels from match_members JOIN users so a
      // rejoin never shows a bare board.
      if (players.length === 0) {
        const roster = await this.gameRepo.getMatchRoster({
          matchId: active.match_id,
          excludeUserId: userId,
        });
        roster.forEach((p) => {
          players.push({
            id: p.id,
            name: p.name || p.username || 'Opponent',
            username: p.username,
            avatar: p.avatar,
            level: p.level,
          });
        });
      }

      if (players.length === 0 && active.opponent_name) {
        players.push({ id: 'opponent', name: active.opponent_name });
      }

      return {
        sessionId: active.session_id,
        matchId: active.match_id,
        gameId: active.game_id,
        wsToken: active.ws_token,
        mode: normalizedMode,
        opponentName: active.opponent_name,
        players,
        myTeam: mySnap?.team,
        teamsLocked: !!matchMeta.teamsLocked,
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
      matchData.mode = matchData.mode.toUpperCase()
      if (['AUTO', 'TOURNAMENT', 'PRACTICE'].includes(matchData.mode)) {
        throw createError("Use matchmaking endpoint for this mode", 400)
      }
      matchData.metadata = {
        ...(matchData.metadata || {}),
        runtime: isGameExist.metadata?.runtime || 'native',
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
      // A real win changes the weekly Games leaderboard — tell the app to
      // silently refetch it (legacy direct-match path).
      if (calculated.result === 'WIN') {
        const { emitLeaderboardsChanged } = require('../../sockets/notification.socket');
        emitLeaderboardsChanged(userId);
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
	      // Respect the start/end window: UPCOMING and expired tournaments are
	      // not joinable, even if already registered for a previous cycle.
	      const now = new Date()
	      const isActive = tournament.status === 'ACTIVE'
	        && new Date(tournament.startsAt) <= now
	        && new Date(tournament.endsAt) > now
	      if (!isActive)
	        throw createError(
	          tournament.status === 'UPCOMING' || new Date(tournament.startsAt) > now
	            ? "Tournament hasn't started yet"
	            : "Tournament has ended",
	          400
	        )
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
      if (!['AUTO', 'CUSTOM', 'TOURNAMENT', 'PRACTICE'].includes(mode))
        throw createError("Matchmaking supports AUTO, CUSTOM, TOURNAMENT, and PRACTICE only", 400)
	      const game = await this.gameRepo.findGameById({gameId: matchData.gameId})
	      if(!game)
	        throw createError("Game not found", 404)

	      let tournamentId = matchData.tournamentId || null
	      // Tournament lobby TTL: opponents can be rare, so the queue must not
	      // die after the 30s AUTO window. Stay open until the tournament ends
	      // (clamped 30 min – 6 h); the client keeps searching indefinitely.
	      let lobbyTtlSeconds = null
	      if (mode === 'TOURNAMENT') {
	        if (!tournamentId)
	          throw createError("Tournament ID is required", 400)
	        const tournament = await this.gameRepo.findTournamentById({tournamentId, userId})
	        if(!tournament)
	          throw createError("Tournament not found", 404)
	        if (tournament.gameId !== game.id)
	          throw createError("Tournament does not belong to this game", 400)
	        await this.joinTournament({userId, tournamentId})
	        const endMs = new Date(tournament.endsAt).getTime()
	        lobbyTtlSeconds = Math.max(30 * 60, Math.min(6 * 60 * 60, Math.floor((endMs - Date.now()) / 1000)))
	      } else {
	        tournamentId = null
	      }

	      const result = await this.gameRepo.joinMatchmaking({userId, game, mode, tournamentId, targetPlayers: matchData.targetPlayers, visibility: matchData.visibility, lobbyTtlSeconds});
        try {
          const { getIO } = require('../../sockets/index');
          const io = getIO();
          
          if (result.status === 'MATCHED') {
            // Emit to ALL players (including requester's other devices/tabs)
            for (const p of result.players) {
              if (!p.isBot) {
                io.to(`user:${p.id}`).emit('matchmaking:matched', result);
              }
            }
          } else if (result.status === 'WAITING') {
            // Notify all other players already in the lobby that someone joined
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

	  async cancelMatchmaking(userId) {
	    try {
	      const result = await this.gameRepo.cancelMatchmaking(userId)
        if (result && result.lobbyState) {
          try {
            const { getIO } = require('../../sockets/index');
            const io = getIO();
            for (const p of result.lobbyState.players) {
              if (p.id !== userId && !p.isBot) {
                io.to(`user:${p.id}`).emit('matchmaking:lobbyUpdated', result.lobbyState);
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

  async getLobby({ userId, lobbyId }) {
    return await this.gameRepo.getLobby({ userId, lobbyId });
  }

  async updateLobby({ userId, lobbyId, updates }) {
    return await this.gameRepo.updateLobby({ userId, lobbyId, updates });
  }

  async deleteLobby({ userId, lobbyId }) {
    return await this.gameRepo.deleteLobby({ userId, lobbyId });
  }

  async joinLobbyByCode({ userId, inviteCode }) {
    const result = await this.gameRepo.joinLobbyByCode({ userId, inviteCode });
    // Notify all existing lobby players that someone joined
    try {
      const { getIO } = require('../../sockets/index');
      const io = getIO();
      for (const p of (result.players || [])) {
        if ((p.id || p.userId) !== userId && !p.isBot) {
          io.to(`user:${p.id || p.userId}`).emit('matchmaking:lobbyUpdated', result);
        }
      }
    } catch (e) { /* non-fatal */ }
    return result;
  }

  async getLobbyPlayers({ userId, lobbyId }) {
    return await this.gameRepo.getLobbyPlayers({ userId, lobbyId });
  }

  async updateLobbyPlayer({ userId, lobbyId, targetUserId, updates }) {
    return await this.gameRepo.updateLobbyPlayer({ userId, lobbyId, targetUserId, updates });
  }

	  async removeLobbyPlayer({ userId, lobbyId, targetUserId }) {
	    const result = await this.gameRepo.removeLobbyPlayer({ userId, lobbyId, targetUserId });
	    // Emit so all real players sync — including revoking a pending invite the
	    // host cancelled, so it doesn't resurrect from stale local state.
	    try {
	      const { getIO } = require('../../sockets/index');
	      const io = getIO();
	      const lobby = await this.gameRepo.getLobby({ userId, lobbyId });
	      for (const p of (lobby.players || [])) {
	        if (!p.isBot) {
	          io.to(`user:${p.id || p.userId}`).emit('matchmaking:lobbyUpdated', lobby);
	        }
	      }
	    } catch (e) { /* non-fatal */ }
	    return result;
	  }

	  async inviteLobbyPlayer({ userId, lobbyId, opponentId }) {
    const result = await this.gameRepo.inviteLobbyPlayer({ userId, lobbyId, opponentId });
    // Notify the invited player
    try {
      const { getIO } = require('../../sockets/index');
      const io = getIO();
      io.to(`user:${opponentId}`).emit('matchmaking:lobbyUpdated', result);
    } catch (e) { /* non-fatal */ }
    return result;
  }

  async shrinkLobby({ userId, lobbyId }) {
    return await this.gameRepo.shrinkLobby({ userId, lobbyId });
  }

  async fillLobbyBots({ userId, lobbyId, count }) {
    const result = await this.gameRepo.fillLobbyBots({ userId, lobbyId, count });
    // Emit lobby update to all real players in the lobby so they see the bot slot fill live
    try {
      const { getIO } = require('../../sockets/index');
      const io = getIO();
      const lobby = await this.gameRepo.getLobby({ userId, lobbyId });
      for (const p of (lobby.players || [])) {
        if (!p.isBot) {
          io.to(`user:${p.id || p.userId}`).emit('matchmaking:lobbyUpdated', lobby);
        }
      }
    } catch (e) { /* non-fatal */ }
    return result;
  }

  async continueLobby({ userId, lobbyId }) {
    return await this.gameRepo.continueLobby({ userId, lobbyId });
  }

  async queueLobbyForMatchmaking({ userId, lobbyId, active = true }) {
    const result = await this.gameRepo.queueLobbyForMatchmaking({ userId, lobbyId, active });
    // Notify all real players in the lobby that the queue state changed
    try {
      const { getIO } = require('../../sockets/index');
      const io = getIO();
      for (const p of (result.players || [])) {
        if (!p.isBot) {
          io.to(`user:${p.id || p.userId}`).emit('matchmaking:lobbyUpdated', result);
        }
      }
    } catch (e) { /* non-fatal */ }
    return result;
  }

  async startLobby({ userId, lobbyId }) {
    const result = await this.gameRepo.startLobby({ userId, lobbyId });
    // Emit matched event to all real players so their lobbies transition
    if (result && result.status === 'MATCHED') {
      try {
        const { getIO } = require('../../sockets/index');
        const io = getIO();
        for (const p of (result.players || [])) {
          if (!p.isBot) {
            io.to(`user:${p.id}`).emit('matchmaking:matched', result);
          }
        }
      } catch (e) { /* non-fatal */ }
    }
    return result;
  }



  async startGameSession({ userId, gameId, mode, matchGroupId }) {
    try {
      const game = await this.gameRepo.findGameById({ gameId });
      if (!game) throw createError("Game not found", 404);

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
      // Turn-based games (chess/ludo/snake-ladder) and multi-round games
      // (scribble/word-rush) routinely run longer than 5 minutes, so a short
      // expiry caused "Session expired" when the client completed the session
      // after a long match. Give them a generous window; single-round realtime
      // games keep the tight 5-minute cap.
      const LONG_SESSION_GAMES = ['chess', 'ludo', 'snake-ladder', 'scribble', 'word-rush'];
      const isLongSessionGame = LONG_SESSION_GAMES.includes(game.slug);
      const sessionTtlMs = isLongSessionGame ? 4 * 60 * 60 * 1000 : 5 * 60 * 1000;
      const expiresAt = new Date(Date.now() + sessionTtlMs);
      
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
          // Normalize to the canonical uppercase mode set so session metadata and
          // match-history inserts are consistent (game_match CHECK constraint).
          metadata: { mode: gameModel.normalizeMatchMode(mode), matchGroupId: effectiveMatchId }
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
      if (session.status !== 'ACTIVE') {
        // Already resolved — either the client double-fired, the server resolved
        // it itself (forfeit / all-offline draw / 3+ removal / abandonment sweep),
        // or the first completion call landed but the PVP opponent hasn't
        // finished yet (PENDING). Never error the player for a finished game:
        // return the recorded outcome (or a safe fallback) so the client renders
        // the final result instead of a confusing error or a stuck state.
        if (session.status === 'PENDING') {
          return {
            result: 'PENDING',
            score: Number(session.validated_score) || 0,
            xpEarned: 0,
            alreadyResolved: true,
          };
        }
        const recorded = await this.gameRepo.findCompletedMatchRecord({
          userId,
          matchGroupId: session.metadata?.matchGroupId || session.id,
        });
        if (recorded) {
          return {
            result: recorded.result,
            score: recorded.score,
            xpEarned: recorded.xpEarned,
            alreadyResolved: true,
          };
        }
        // No history row — the session was cancelled/resolved before a record
        // existed. Return a graceful loss instead of "Session already completed
        // or cancelled" so the client lands on the result screen, not an alert.
        return { result: 'LOSS', score: 0, xpEarned: 0, alreadyResolved: true };
      }

      const game = await this.gameRepo.findGameById({ gameId: session.game_id });
      if (!game) throw createError("Game not found", 404);

      let rawScore = 0;
      let duration = 0;
      let engineResult = null;

      // Native Runtime Resolution
      const { MatchManager, MATCH_STATES } = require('./engine/MatchManager');
      const EventStore = require('./engine/EventStore');
      const matchGroupId = session.metadata?.matchGroupId || session.id;

      // Redis snapshots are cleaned up after the engine archives a finished match.
      // Load from Redis first, then fall back to the archived final state so PVP
      // scores are still read correctly instead of silently defaulting to 0.
      let matchState = await EventStore.loadMatchSnapshot(matchGroupId);
      if (!matchState) {
        const archived = await this.gameRepo.getMatchArchivedState({ matchId: matchGroupId });
        if (archived) matchState = archived;
      }
      if (!matchState) {
        const init = await MatchManager.loadOrInitializeMatch(matchGroupId, game.slug, session.metadata || {});
        matchState = init.state;
      }

      // Session TTL backstop: reject ONLY genuinely abandoned sessions. A match
      // the engine actually finished (snapshot FINISHED, or archived/cleaned)
      // is always completable — the engine state is authoritative, so a long
      // match or a reconnect pause must never surface "Session expired" on an
      // already-finished game (the classic completion error).
      if (new Date(session.expires_at) < new Date()) {
        const status = matchState?.status;
        const pluginFinished = matchState?.pluginState?.status === 'finished';
        const matchOver = !matchState
          || status === MATCH_STATES.FINISHED
          || status === MATCH_STATES.ARCHIVED
          || pluginFinished
          || (status !== MATCH_STATES.ACTIVE && status !== MATCH_STATES.PAUSED && status !== MATCH_STATES.WAITING);
        if (!matchOver) throw createError("Session expired", 400);
      }

      if (matchState) {
         if (game.slug === 'chess' || game.slug === 'ludo' || game.slug === 'snake-ladder') {
            if (matchState.status === MATCH_STATES.FINISHED) {
               // A finished turn-based match with no winner is a forced draw
               // (all players went offline, or the engine produced a draw).
               if (!matchState.pluginState?.winner) {
                  await this.gameRepo.updateGameSessionStatus({
                    sessionId, status: 'COMPLETED', completedAt: new Date().toISOString()
                  });
                  await this.gameRepo.recordMatchHistory({
                    userId, gameId: game.id, mode: session.metadata?.mode, result: 'DRAW',
                    score: 0, duration: 60, xpEarned: 0, matchGroupId
                  });
                  return { result: 'DRAW', score: 0, xpEarned: 0, forcedDraw: true };
               }
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

      // PRACTICE mode: the entry fee is deducted at session start, but the run is
      // solo practice — no XP reward, regardless of win/loss. Keep the result and
      // score for history, but zero out any credit so nothing is awarded.
      const isPractice = gameModel.normalizeMatchMode(session.metadata?.mode) === 'PRACTICE';

      // Bot-filled matches (AUTO/PRACTICE/CUSTOM lobbies) — the bot has no game_session, so
      // resolve immediately against the bot's final score instead of waiting on a PVP opponent.
      const ps = (matchState && matchState.pluginState) || {};
      const matchPlayers = (matchState && (matchState.metadata?.players || matchState.players)) || [];
      const hasBotOpponent =
        matchPlayers.some((p) => p && (p.isBot || String(p.userId || p.id || '').startsWith('bot_')))
        || Object.keys(ps.scores || {}).some((id) => String(id).startsWith('bot_'));
      if (hasBotOpponent) {
        const botScores = Object.entries(ps.scores || {})
          .filter(([id]) => String(id).startsWith('bot_'))
          .map(([, v]) => Number(v) || 0);
        const botScore = botScores.length ? Math.max(...botScores) : 0;

        let myResult = calculated.score > botScore ? 'WIN' : calculated.score < botScore ? 'LOSS' : 'DRAW';
        // Turn-based games: the engine winner is authoritative (draw if null)
        if (['chess', 'ludo', 'snake-ladder'].includes(game.slug)) {
          const winner = ps.winner;
          myResult = winner === userId ? 'WIN' : winner ? 'LOSS' : 'DRAW';
        }
        // Practice = no rewards: force 0 XP even on a win.
        const myXp = isPractice ? 0 : (myResult === 'WIN' ? calculated.xpEarned : 0);

        await this.gameRepo.updateGameSessionStatus({
          sessionId, status: 'COMPLETED', completedAt: new Date().toISOString()
        });

        await this.gameRepo.recordMatchHistory({
          userId, gameId: game.id, mode: session.metadata?.mode, result: myResult,
          score: calculated.score, duration, xpEarned: myXp, matchGroupId
        });

        if (myXp > 0 && this.xpSvc) {
          await this.xpSvc.creditXP({
            userId, xp: myXp,
            transactionType: 'earned', sourceType: `game_session_${sessionId}`
          });
        }

        // A real win changes the weekly Games leaderboard (wins this week) —
        // tell the app to silently refetch it.
        if (myResult === 'WIN') {
          const { emitLeaderboardsChanged } = require('../../sockets/notification.socket');
          emitLeaderboardsChanged(userId);
        }

        const ledgerEntry = await this.gameRepo.createRewardLedgerEntry({
          ledgerData: {
            sessionId, userId, gameId: game.id,
            validatedScore: calculated.score,
            xpAwarded: myXp,
            deviceId: null, ipAddress: null
          }
        });

        // Tournament scoring (bot matches): +1 win on the player's entry when
        // this match group belongs to a tournament (no-op otherwise).
        await this.gameRepo.recordTournamentEntryResult({
          matchGroupId, userId, isWin: myResult === 'WIN', xpEarned: myXp
        });

        return {
          result: myResult, score: calculated.score,
          xpEarned: myXp, ledgerId: ledgerEntry.id
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
        // Practice = no rewards: force 0 XP even on a win.
        let myXp = isPractice ? 0 : (myResult === 'WIN' ? calculated.xpEarned : 0);
        
        // In a real app we'd update both ledgers and wallets here and emit WS events.
        // For now, we instantly resolve the current player.
        await this.gameRepo.updateGameSessionStatus({
          sessionId, status: 'COMPLETED', completedAt: new Date().toISOString()
        });
        
        await this.gameRepo.recordMatchHistory({
          userId, gameId: game.id, mode: session.metadata?.mode, result: myResult,
          score: myScore, duration, xpEarned: myXp, matchGroupId
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
          score: opScore, duration, xpEarned: opXp, matchGroupId
        });

        if (opXp > 0 && this.xpSvc) {
          this.xpSvc.creditXP({
            userId: opponentSession.user_id, xp: opXp,
            transactionType: 'earned', sourceType: `game_session_${opponentSession.id}`
          }).catch(console.error);
        }

        const { emitNotification, emitLeaderboardsChanged } = require('../../sockets/notification.socket');
        // A real win changes the weekly Games leaderboard — tell each winner
        // (self and/or opponent) to silently refetch it.
        if (myResult === 'WIN') emitLeaderboardsChanged(userId);
        if (opResult === 'WIN') emitLeaderboardsChanged(opponentSession.user_id);
        emitNotification(opponentSession.user_id, {
          type: 'MATCH_RESOLVED',
          title: 'Match Resolved',
          message: opResult === 'WIN' ? 'You won!' : 'You lost.',
          payload: { matchId: matchGroupId, result: opResult, score: opScore, xpEarned: opXp }
        });

        // Tournament scoring (PVP): +1 win on BOTH players' entries when this
        // match group belongs to a tournament (no-op otherwise). This closes the
        // gap where tournament leaderboards stayed empty — the old completeGameMatch
        // path updated entries, but the live session flow never did.
        await this.gameRepo.recordTournamentEntryResult({
          matchGroupId, userId, isWin: myResult === 'WIN', xpEarned: myXp
        });
        await this.gameRepo.recordTournamentEntryResult({
          matchGroupId, userId: opponentSession.user_id, isWin: opResult === 'WIN', xpEarned: opXp
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
