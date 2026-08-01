'use strict';

const crypto = require('crypto');
const pool = require('../config/database');
const GameRegistry = require('../modules/game/engine');
const { MatchManager, MATCH_STATES } = require('../modules/game/engine/MatchManager');
const EventStore = require('../modules/game/engine/EventStore');
const TimerEngine = require('../modules/game/engine/TimerEngine');
const BotMatchHandler = require('./handlers/BotMatchHandler');

// ─── Standardized Protocol Events ────────────────────────────────────────────
const EVENTS = {
  // Inbound (Client → Server)
  JOIN: 'JOIN',
  LEAVE: 'LEAVE',
  READY: 'READY',
  MOVE: 'MOVE',
  PING: 'PING',

  // Outbound (Server → Client)
  CONNECT_ACK: 'CONNECT',
  START: 'START',
  STATE: 'STATE',
  SYNC: 'SYNC',
  PONG: 'PONG',
  PAUSE: 'PAUSE',
  RESUME: 'RESUME',
  GAME_OVER: 'GAME_OVER',
  ERROR: 'ERROR',
};

// Reconnect grace window (ms)
const RECONNECT_TIMEOUT_MS = 60 * 1000;
// Turn timeout (ms) for turn-based games
const TURN_TIMEOUT_MS = 60 * 1000;

const setupGameSocket = (io) => {
  const gameNs = io.of('/game-engine');

  const botHandler = new BotMatchHandler(
    gameNs,
    EVENTS,
    (mId, s) => _archiveMatch(mId, s),
    (ns, mId, gs, s) => _startTurnTimer(ns, mId, gs, s)
  );

  // ── BullMQ Worker for Distributed Timers ──────────────────────────────────
  if (!io._timerWorkerInitialized) {
    io._timerWorkerInitialized = true;
    const { Worker } = require('bullmq');
    const redisClient = require('../config/redis');
    
    new Worker('GameTimers', async (job) => {
      const { matchId, type, userId, gameSlug } = job.data;
      const latestState = await EventStore.loadMatchSnapshot(matchId);
      if (!latestState) return;
  
      if (type === 'reconnect') {
        if (latestState.status !== MATCH_STATES.PAUSED) return;
        latestState.status = MATCH_STATES.FINISHED;
        latestState.winner = 'opponent'; 
        await EventStore.saveMatchSnapshot(matchId, latestState);
        await EventStore.appendEvent(matchId, { type: 'FORFEIT', userId });
        gameNs.to(`match:${matchId}`).emit(EVENTS.GAME_OVER, {
          state: latestState,
          reason: 'forfeit',
          forfeitedBy: userId,
        });
        botHandler.handleMatchEnd(matchId, gameSlug, latestState);
        await _archiveMatch(matchId, latestState);
        
        // Notify players in their global user rooms (for updating UI like GamesScreen)
        const players = latestState.metadata?.players || [];
        players.forEach(p => {
          io.to(`user:${p.userId}`).emit('SESSION_EXPIRED', { matchId });
        });
      } else if (type === 'turn') {
        if (latestState.status !== MATCH_STATES.ACTIVE) return;
        const currentPlayerId = latestState.pluginState?.turnOrder?.[latestState.pluginState?.currentTurnIndex];
        if (!currentPlayerId) return;
        await EventStore.appendEvent(matchId, { type: 'TURN_TIMEOUT', userId: currentPlayerId });
  
        if (gameSlug === 'chess') {
          latestState.status = MATCH_STATES.FINISHED;
          latestState.winner = latestState.pluginState?.turnOrder?.find((id) => id !== currentPlayerId);
          if (latestState.pluginState) {
            latestState.pluginState.status = 'finished';
            latestState.pluginState.winner = latestState.winner;
            latestState.pluginState.drawReason = 'timeout';
            if (latestState.pluginState.timers) {
              const turnColor = latestState.pluginState.turn;
              latestState.pluginState.timers[turnColor] = 0;
            }
          }
          await EventStore.saveMatchSnapshot(matchId, latestState);
          gameNs.to(`match:${matchId}`).emit(EVENTS.SYNC, {
            state: latestState.pluginState,
            reason: 'turn_timeout',
            timedOutPlayer: currentPlayerId,
          });
          gameNs.to(`match:${matchId}`).emit(EVENTS.GAME_OVER, {
            state: latestState,
            winner: latestState.winner,
            reason: 'timeout'
          });
          botHandler.handleMatchEnd(matchId, gameSlug, latestState);
          await _archiveMatch(matchId, latestState);
          
          const players = latestState.metadata?.players || [];
          players.forEach(p => {
            io.to(`user:${p.userId}`).emit('SESSION_EXPIRED', { matchId });
          });
        } else {
          latestState.pluginState = {
            ...latestState.pluginState,
            currentTurnIndex:
              ((latestState.pluginState.currentTurnIndex || 0) + 1) %
              (latestState.pluginState.turnOrder?.length || 1),
          };
          await EventStore.saveMatchSnapshot(matchId, latestState);
          gameNs.to(`match:${matchId}`).emit(EVENTS.SYNC, {
            state: latestState.pluginState,
            reason: 'turn_timeout',
            timedOutPlayer: currentPlayerId,
          });
          _startTurnTimer(gameNs, matchId, gameSlug, latestState);
        }
      } else if (type === 'round') {
        if (latestState.status !== MATCH_STATES.ACTIVE) return;
        const GameRegistry = require('../modules/game/engine/GameRegistry');
        const plugin = GameRegistry.createInstance(gameSlug, latestState.metadata);
        latestState.pluginState = plugin.advanceRound(latestState.pluginState);
        
        if (plugin.isFinished(latestState.pluginState)) {
          latestState.status = MATCH_STATES.FINISHED;
          TimerEngine.clearAllTimers(matchId);
          await EventStore.saveMatchSnapshot(matchId, latestState);
          gameNs.to(`match:${matchId}`).emit(EVENTS.GAME_OVER, {
            state: latestState,
            winner: latestState.pluginState?.winner || null,
          });
          botHandler.handleMatchEnd(matchId, gameSlug, latestState);
          await _archiveMatch(matchId, latestState);
          
          const players = latestState.metadata?.players || [];
          players.forEach(p => {
            io.to(`user:${p.userId}`).emit('SESSION_EXPIRED', { matchId });
          });
        } else {
          await EventStore.saveMatchSnapshot(matchId, latestState);
          const sockets = await gameNs.in(`match:${matchId}`).fetchSockets();
          for (const s of sockets) {
            const socketUserId = s.data?.userId || s.userId || (s.handshake?.auth?.userId);
            if(!socketUserId) continue;
            const ps = _getPlayerState(gameSlug, latestState, socketUserId);
            if(ps) {
               s.emit(EVENTS.SYNC, {
                 state: ps.pluginState,
                 reason: 'round_timeout',
               });
            }
          }
          botHandler.handleTurn(matchId, gameSlug, latestState);
          _startTurnTimer(gameNs, matchId, gameSlug, latestState);
        }
      }
    }, { connection: redisClient }).on('failed', (job, err) => {
      console.error(`[TimerWorker] Job ${job.id} failed:`, err);
    });
  }

  // ─── Auth Middleware ─────────────────────────────────────────────────────
  gameNs.use(async (socket, next) => {
    const { matchId, userId, token } = socket.handshake.auth;
    if (!matchId || !userId || !token) {
      return next(new Error('Authentication required: matchId, userId, token'));
    }

    try {
      // Validate the user's match token AND fetch all players in this match
      const { rows } = await pool.query(
        `SELECT mm.user_id, mm.ws_token, mm.player_color, g.slug as game_slug, gm.metadata as match_metadata, gm.mode as match_mode
         FROM match_members mm
         JOIN game_matches gm ON mm.match_id = gm.id
         JOIN game g ON gm.game_id = g.id
         WHERE mm.match_id = $1`,
        [matchId]
      );

      // Confirm this user's token is valid
      const myRow = rows.find(r => r.user_id === userId && r.ws_token === token);
      if (!myRow) return next(new Error('Invalid match credentials'));

      socket.matchId = matchId;
      socket.userId = userId;
      socket.gameSlug = myRow.game_slug;
      socket.matchPlayers = rows.map(r => ({ userId: r.user_id, color: r.player_color }));
      socket.matchMetadata = myRow.match_metadata || {};
      socket.matchMode = (myRow.match_mode || 'QUICK').toUpperCase();

      next();
    } catch (e) {
      next(new Error('Auth verification failed'));
    }
  });

  // ─── Connection Handler ──────────────────────────────────────────────────
  gameNs.on('connection', async (socket) => {
    const { matchId, userId, gameSlug } = socket;
    const matchRoom = `match:${matchId}`;

    socket.join(matchRoom);
    console.info(`[GameEngine] ${userId} connected to match ${matchId} (${gameSlug})`);

    // Load or initialize match state via the generic engine
    let state;
    try {
      const players = [...(socket.matchPlayers || [])];
      const isBotMode = botHandler.setupBotPlayer(socket, players, matchId);

      const result = await MatchManager.loadOrInitializeMatch(matchId, gameSlug, {
        players,
        maxPlayers: isBotMode ? 2 : players.length || 2,
        matchMetadata: socket.matchMetadata,
      });
      state = result.state;
    } catch (e) {
      socket.emit(EVENTS.ERROR, { message: `Failed to load match: ${e.message}` });
      return socket.disconnect();
    }

    try {
      const activeReconnectTimeout = RECONNECT_TIMEOUT_MS;

      if (state.status === MATCH_STATES.PAUSED) {
      const pausedAt = state.pausedAt || Date.now() - activeReconnectTimeout; // assume expired if missing
      if (Date.now() - pausedAt >= activeReconnectTimeout) {
        state.status = MATCH_STATES.FINISHED;
        state.winner = 'opponent';
        await EventStore.saveMatchSnapshot(matchId, state);
        await _archiveMatch(matchId, state);
        socket.emit(EVENTS.GAME_OVER, { state, reason: 'forfeit', forfeitedBy: 'opponent' });
        botHandler.handleMatchEnd(matchId, gameSlug, state);
        return socket.disconnect();
      } else {
        // Player returned within the reconnect window
        state.status = MATCH_STATES.ACTIVE;
        state.pausedAt = null;
        await EventStore.saveMatchSnapshot(matchId, state);
        
        gameNs.to(matchRoom).emit(EVENTS.RESUME, { userId });
        botHandler.handleResume(matchId, gameSlug, state);
      }
    }

    let reconnectWindowMs = 0;
    if (state.status === MATCH_STATES.PAUSED) {
      const pausedAt = state.pausedAt || Date.now();
      const elapsed = Date.now() - pausedAt;
      reconnectWindowMs = Math.max(0, activeReconnectTimeout - elapsed);
    }

    // ── Send CONNECT_ACK with current state snapshot ───────────────────
    socket.emit(EVENTS.CONNECT_ACK, {
      matchId,
      gameSlug,
      state,
      status: state.status || MATCH_STATES.WAITING,
      reconnectWindowMs,
    });

    // ── Cancel any active reconnect timer for this player ──────────────
    if (state.status === MATCH_STATES.ACTIVE) {
      await TimerEngine.clearTimer(matchId, `reconnect:${userId}`);
    }

    // ── PING / PONG ─────────────────────────────────────────────────────
    socket.on(EVENTS.PING, () => {
      socket.emit(EVENTS.PONG, { ts: Date.now() });
    });

    // ── READY ───────────────────────────────────────────────────────────
    socket.on(EVENTS.READY, async () => {
      try {
        let snap = await EventStore.loadMatchSnapshot(matchId);
        if (!snap) snap = state;

        if (!snap.readyPlayers) snap.readyPlayers = [];
        if (!snap.readyPlayers.includes(userId)) snap.readyPlayers.push(userId);

        // BOT MATCH: if match mode is BOT, only 1 real player needed
        const isBotMatch = socket.matchMode === 'BOT' || socket.matchMetadata?.mode === 'BOT' || socket.matchMetadata?.mode === 'bot';
        const totalPlayers = (socket.matchPlayers && socket.matchPlayers.length > 0) ? socket.matchPlayers.length : 2;
        // For bot match or solo match, we need 1 real player ready; for others, need all
        const requiredReady = (isBotMatch || totalPlayers === 1) ? 1 : totalPlayers;
        const allReady = snap.readyPlayers.length >= requiredReady;

        if (allReady && snap.status !== MATCH_STATES.ACTIVE) {
          snap.status = MATCH_STATES.ACTIVE;
          snap.startedAt = Date.now();
          snap.isBotMatch = isBotMatch;
          await EventStore.saveMatchSnapshot(matchId, snap);
          await EventStore.appendEvent(matchId, { type: 'GAME_START' });

          // Send player-specific start state
          const sockets = await gameNs.in(matchRoom).fetchSockets();
          for (const s of sockets) {
            const playerState = _getPlayerState(gameSlug, snap, s.userId);
            s.emit(EVENTS.START, { state: playerState, startedAt: snap.startedAt });
          }

          // For bot match: initialize bot and start
          botHandler.handleMatchStart(matchId, gameSlug, snap);
          
          _startTurnTimer(gameNs, matchId, gameSlug, snap);
        } else {
          await EventStore.saveMatchSnapshot(matchId, snap);
          gameNs.to(matchRoom).emit(EVENTS.STATE, { state: snap });
        }
      } catch (e) {
        socket.emit(EVENTS.ERROR, { message: e.message });
      }
    });

    // ── MOVE ────────────────────────────────────────────────────────────
    socket.on(EVENTS.MOVE, async (moveData) => {
      try {
        // Scribble STROKE events: just broadcast, don't mutate state
        if (moveData.type === 'STROKE_CHUNK' || moveData.type === 'STROKE_END' || moveData.type === 'CLEAR') {
          socket.to(matchRoom).emit(EVENTS.SYNC, { type: moveData.type, ...moveData, userId });
          return;
        }

        // Remap Scribble guess: frontend sends { type:'GUESS', text } but plugin expects { type:'GUESS', word }
        if (moveData.type === 'GUESS' && moveData.text && !moveData.word) {
          moveData.word = moveData.text;
        }

        const updatedState = await MatchManager.handlePlayerMove(
          matchId,
          gameSlug,
          userId,
          moveData,
        );

        if (updatedState.status === MATCH_STATES.FINISHED) {
          TimerEngine.clearAllTimers(matchId);
          gameNs.to(matchRoom).emit(EVENTS.GAME_OVER, {
            state: updatedState,
            winner: updatedState.pluginState?.winner || null,
          });
          botHandler.handleMatchEnd(matchId, gameSlug, updatedState);
          await _archiveMatch(matchId, updatedState);
        } else {
          // Send player-specific states (e.g. scribble drawer sees word)
          const sockets = await gameNs.in(matchRoom).fetchSockets();
          for (const s of sockets) {
            const ps = _getPlayerState(gameSlug, updatedState, s.userId);
            s.emit(EVENTS.SYNC, {
              state: ps.pluginState,
              valid: true,
              moveType: moveData.type,
              userId,
            });
          }
          _startTurnTimer(gameNs, matchId, gameSlug, updatedState);
          
          if (updatedState.isBotMatch) {
            const turnBasedSlugs = ['chess', 'ludo', 'snake-ladder'];
            if (!turnBasedSlugs.includes(gameSlug)) {
              botHandler.handleTurn(matchId, gameSlug, updatedState);
            }
          }
        }
      } catch (e) {
        socket.emit(EVENTS.ERROR, { message: e.message });
      }
    });

    // ── LEAVE ───────────────────────────────────────────────────────────
    socket.on(EVENTS.LEAVE, async () => {
      await _handleDisconnect(gameNs, socket, matchRoom);
    });

    // ── Disconnect ──────────────────────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      console.info(`[GameEngine] ${userId} disconnected from ${matchId}: ${reason}`);
      await _handleDisconnect(gameNs, socket, matchRoom);
    });
    
    } catch (err) {
      console.error('[GameEngine] Unhandled error during connection setup:', err);
      socket.disconnect();
    }
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────

  async function _handleDisconnect(ns, socket, matchRoom) {
    const { matchId, userId, gameSlug } = socket;

    // Pause the game briefly and give the player a reconnect window
    const state = await EventStore.loadMatchSnapshot(matchId);
    const isBotMatch = state && (state.isBotMatch || state.metadata?.mode === 'BOT' || state.metadata?.mode === 'bot');
    const activeReconnectTimeout = RECONNECT_TIMEOUT_MS;

    if (state && state.status === MATCH_STATES.ACTIVE) {
      state.status = MATCH_STATES.PAUSED;
      state.pausedAt = Date.now();
      if (state.readyPlayers) {
        state.readyPlayers = state.readyPlayers.filter(id => id !== userId);
      }
      await EventStore.saveMatchSnapshot(matchId, state);
      ns.to(matchRoom).emit(EVENTS.PAUSE, {
        reason: 'player_disconnected',
        userId,
        reconnectWindowMs: activeReconnectTimeout,
      });
      
      botHandler.handlePause(matchId, gameSlug, state);
    }

    // Set reconnect timeout — forfeit if player doesn't return
    await TimerEngine.startTimer(matchId, `reconnect:${userId}`, activeReconnectTimeout, {
      type: 'reconnect',
      userId,
      gameSlug,
    });
  }

  async function _startTurnTimer(ns, matchId, gameSlug, state) {
    try {
      const turnBasedSlugs = ['chess', 'ludo', 'snake-ladder'];
      if (turnBasedSlugs.includes(gameSlug)) {
        const currentPlayerId =
          state.pluginState?.turnOrder?.[state.pluginState?.currentTurnIndex];
        if (!currentPlayerId) return;

      await TimerEngine.clearAllTimers(matchId);

      if (currentPlayerId.startsWith('bot_')) {
        botHandler.handleTurn(matchId, gameSlug, state, currentPlayerId);
        return;
      }

      let timerDuration = TURN_TIMEOUT_MS;
      if (gameSlug === 'chess') {
        const turnColor = state.pluginState.turn;
        timerDuration = state.pluginState.timers?.[turnColor] ?? 600000;
        
        // Reset lastMoveTime on turn start if this is a fresh reconnect/start
        if (!state.pluginState.lastMoveTime) {
          state.pluginState.lastMoveTime = Date.now();
          EventStore.saveMatchSnapshot(matchId, state);
        }
      }

      await TimerEngine.startTimer(matchId, 'turn', timerDuration, {
        type: 'turn',
        gameSlug,
      });
    } else if (gameSlug === 'scribble') {
      const ROUND_TIMEOUT_MS = 80000;
      botHandler.handleTurn(matchId, gameSlug, state);

      await TimerEngine.startTimer(matchId, 'round', ROUND_TIMEOUT_MS, {
        type: 'round',
        gameSlug,
      });
    }
    } catch (err) {
      console.error('[GameEngine] Error in _startTurnTimer:', err);
    }
  }

  // ── Player-specific state helper ─────────────────────────────────────────
  function _getPlayerState(gameSlug, fullState, playerId) {
    // Scribble: drawer sees word, guessers see mask
    if (gameSlug === 'scribble' && fullState.pluginState) {
      const ps = fullState.pluginState;
      const drawer = ps.turnOrder?.[ps.currentDrawerIndex];
      if (playerId === drawer) {
        // Drawer state: include word, mask it for others
        const wordMask = ps.secretWord ? ps.secretWord.replace(/./g, '_') : null;
        return { ...fullState, pluginState: { ...ps, word: ps.secretWord, wordMask, drawerId: drawer } };
      } else {
        const wordMask = ps.secretWord ? ps.secretWord.split('').map((c, i) => {
          // Reveal letters as hints after 30s
          return '_';
        }).join(' ') : null;
        const { secretWord, ...safe } = ps;
        return { ...fullState, pluginState: { ...safe, wordMask, drawerId: drawer } };
      }
    }
    return fullState;
  }

  async function _archiveMatch(matchId, finalState) {
    try {
      await pool.query(
        `UPDATE game_matches SET status = 'COMPLETED', metadata = metadata || $1, ended_at = NOW()
         WHERE id = $2`,
        [
          JSON.stringify({ 
            finalState,
            result: finalState.pluginState?.winner || 'DRAW'
          }),
          matchId,
        ]
      );
      // Clean up Redis after archiving
      await EventStore.cleanupMatch(matchId);
    } catch (e) {
      console.error('[GameEngine] Failed to archive match:', e.message);
    }
  }
};

module.exports = { setupGameSocket };
