'use strict';

const crypto = require('crypto');
const pool = require('../config/database');
const GameRegistry = require('../modules/game/engine');
const { MatchManager, MATCH_STATES } = require('../modules/game/engine/MatchManager');
const EventStore = require('../modules/game/engine/EventStore');
const TimerEngine = require('../modules/game/engine/TimerEngine');

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
const RECONNECT_TIMEOUT_MS = 30 * 1000;
// Turn timeout (ms) for turn-based games
const TURN_TIMEOUT_MS = 60 * 1000;

const setupGameSocket = (io) => {
  const gameNs = io.of('/game-engine');

  // ─── Auth Middleware ─────────────────────────────────────────────────────
  gameNs.use(async (socket, next) => {
    const { matchId, userId, token } = socket.handshake.auth;
    if (!matchId || !userId || !token) {
      return next(new Error('Authentication required: matchId, userId, token'));
    }

    try {
      // Validate the user's match token from the DB
      const { rows } = await pool.query(
        `SELECT mm.*, g.slug as game_slug
         FROM match_members mm
         JOIN game_matches gm ON mm.match_id = gm.id
         JOIN game g ON gm.game_id = g.id
         WHERE mm.match_id = $1 AND mm.user_id = $2 AND mm.ws_token = $3`,
        [matchId, userId, token]
      );

      if (!rows[0]) return next(new Error('Invalid match credentials'));

      socket.matchId = matchId;
      socket.userId = userId;
      socket.gameSlug = rows[0].game_slug;
      socket.playerData = rows[0];

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
      const result = await MatchManager.loadOrInitializeMatch(matchId, gameSlug, {
        players: socket.playerData?.players || [],
      });
      state = result.state;
    } catch (e) {
      socket.emit(EVENTS.ERROR, { message: `Failed to load match: ${e.message}` });
      return socket.disconnect();
    }

    // ── Send CONNECT_ACK with current state snapshot ───────────────────
    socket.emit(EVENTS.CONNECT_ACK, {
      matchId,
      gameSlug,
      state,
      status: state.status || MATCH_STATES.WAITING,
    });

    // ── Cancel any active reconnect timer for this player ──────────────
    TimerEngine.clearTimer(matchId, `reconnect:${userId}`);

    // ── PING / PONG ─────────────────────────────────────────────────────
    socket.on(EVENTS.PING, () => {
      socket.emit(EVENTS.PONG, { ts: Date.now() });
    });

    // ── READY ───────────────────────────────────────────────────────────
    socket.on(EVENTS.READY, async () => {
      try {
        const updatedState = await MatchManager.handlePlayerJoin(matchId, gameSlug, userId);

        if (updatedState.status === MATCH_STATES.READY) {
          // All players are ready — start the game
          updatedState.status = MATCH_STATES.ACTIVE;
          updatedState.startedAt = Date.now();
          await EventStore.saveMatchSnapshot(matchId, updatedState);
          await EventStore.appendEvent(matchId, { type: 'GAME_START' });

          gameNs.to(matchRoom).emit(EVENTS.START, {
            state: updatedState,
            startedAt: updatedState.startedAt,
          });

          // Start turn timer for turn-based games
          _startTurnTimer(gameNs, matchId, gameSlug, updatedState);
        } else {
          // Broadcast updated state (waiting for more players)
          gameNs.to(matchRoom).emit(EVENTS.STATE, { state: updatedState });
        }
      } catch (e) {
        socket.emit(EVENTS.ERROR, { message: e.message });
      }
    });

    // ── MOVE ────────────────────────────────────────────────────────────
    socket.on(EVENTS.MOVE, async (moveData) => {
      try {
        const updatedState = await MatchManager.handlePlayerMove(
          matchId,
          gameSlug,
          userId,
          moveData,
        );

        if (updatedState.status === MATCH_STATES.FINISHED) {
          // Clear all timers
          TimerEngine.clearAllTimers(matchId);

          // Notify all players
          gameNs.to(matchRoom).emit(EVENTS.GAME_OVER, {
            state: updatedState,
            winner: updatedState.pluginState?.winner || null,
          });

          // Archive to DB
          await _archiveMatch(matchId, updatedState);
        } else {
          // Broadcast updated state
          gameNs.to(matchRoom).emit(EVENTS.SYNC, { state: updatedState.pluginState });

          // Restart turn timer
          _startTurnTimer(gameNs, matchId, gameSlug, updatedState);
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
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────

  async function _handleDisconnect(ns, socket, matchRoom) {
    const { matchId, userId, gameSlug } = socket;

    // Pause the game briefly and give the player a reconnect window
    const state = await EventStore.loadMatchSnapshot(matchId);
    if (state && state.status === MATCH_STATES.ACTIVE) {
      state.status = MATCH_STATES.PAUSED;
      await EventStore.saveMatchSnapshot(matchId, state);
      ns.to(matchRoom).emit(EVENTS.PAUSE, {
        reason: 'player_disconnected',
        userId,
        reconnectWindowMs: RECONNECT_TIMEOUT_MS,
      });
    }

    // Set reconnect timeout — forfeit if player doesn't return
    TimerEngine.startTimer(matchId, `reconnect:${userId}`, RECONNECT_TIMEOUT_MS, async () => {
      const latestState = await EventStore.loadMatchSnapshot(matchId);
      if (!latestState || latestState.status !== MATCH_STATES.PAUSED) return;

      latestState.status = MATCH_STATES.FINISHED;
      latestState.winner = 'opponent'; // forfeit
      await EventStore.saveMatchSnapshot(matchId, latestState);
      await EventStore.appendEvent(matchId, { type: 'FORFEIT', userId });

      ns.to(matchRoom).emit(EVENTS.GAME_OVER, {
        state: latestState,
        reason: 'forfeit',
        forfeitedBy: userId,
      });

      await _archiveMatch(matchId, latestState);
    });
  }

  function _startTurnTimer(ns, matchId, gameSlug, state) {
    // Only apply turn timers to turn-based games
    const turnBasedSlugs = ['chess', 'ludo', 'snake-ladder'];
    if (!turnBasedSlugs.includes(gameSlug)) return;

    const currentPlayerId =
      state.pluginState?.turnOrder?.[state.pluginState?.currentTurnIndex];
    if (!currentPlayerId) return;

    TimerEngine.startTimer(matchId, 'turn', TURN_TIMEOUT_MS, async () => {
      const latestState = await EventStore.loadMatchSnapshot(matchId);
      if (!latestState || latestState.status !== MATCH_STATES.ACTIVE) return;

      await EventStore.appendEvent(matchId, { type: 'TURN_TIMEOUT', userId: currentPlayerId });

      // Penalize turn-skipper — advance turn
      latestState.pluginState = {
        ...latestState.pluginState,
        currentTurnIndex:
          ((latestState.pluginState.currentTurnIndex || 0) + 1) %
          (latestState.pluginState.turnOrder?.length || 1),
      };
      await EventStore.saveMatchSnapshot(matchId, latestState);

      ns.to(`match:${matchId}`).emit(EVENTS.SYNC, {
        state: latestState.pluginState,
        reason: 'turn_timeout',
        timedOutPlayer: currentPlayerId,
      });

      // Restart timer for next player
      _startTurnTimer(ns, matchId, gameSlug, latestState);
    });
  }

  async function _archiveMatch(matchId, finalState) {
    try {
      await pool.query(
        `UPDATE game_matches SET status = 'COMPLETED', result = $1, metadata = metadata || $2, ended_at = NOW()
         WHERE id = $3`,
        [
          JSON.stringify(finalState.pluginState?.winner || 'DRAW'),
          JSON.stringify({ finalState }),
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
