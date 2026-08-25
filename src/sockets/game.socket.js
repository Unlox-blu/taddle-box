'use strict';

/**
 * Game Socket Handler — rewritten for the new architecture.
 *
 * Key changes:
 *   - Per-match actor (single writer, no distributed lock)
 *   - Plugin-authoritative timers (getTimers, canPlayerAct)
 *   - PostgreSQL-backed EventStore (SSOT in PG, Redis accelerator)
 *   - Atomic outbox publishing for downstream services
 *   - Crash recovery rehydration via snapshot + event replay
 *   - Rate limiting with atomic Lua scripts
 */

const crypto = require('crypto');
const pool = require('../config/database');
const GameRegistry = require('../modules/game/engine');
const { MatchManager, MATCH_STATES } = require('../modules/game/engine/MatchManager');
const EventStore = require('../modules/game/engine/EventStore');
const TimerEngine = require('../modules/game/engine/TimerEngine');
const BotMatchHandler = require('./handlers/BotMatchHandler');

// ─── Standardized Protocol Events ────────────────────────────────────────
const EVENTS = {
  // Inbound (Client → Server)
  JOIN: 'JOIN',
  LEAVE: 'LEAVE',
  READY: 'READY',
  MOVE: 'MOVE',
  PING: 'PING',
  ROUND_READY: 'ROUND_READY',  // client confirms round assets loaded
  // Bidirectional
  CHAT: 'CHAT',

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
  // Round lifecycle
  ROUND_CREATED: 'ROUND_CREATED',
  ROUND_STARTED: 'ROUND_STARTED',
  ROUND_FINISHED: 'ROUND_FINISHED',
  MATCH_FINISHED: 'MATCH_FINISHED',
};

// ─── Rate limiting constants ─────────────────────────────────────────────
const RATE_LIMIT_MOVE = { limit: 30, windowSec: 1 };
const RATE_LIMIT_CHAT = { limit: 10, windowSec: 1 };

// Reconnect grace window (ms)
const RECONNECT_TIMEOUT_MS = 60 * 1000;
// Minimum gap between chat messages from one user (ms)
const CHAT_THROTTLE_MS = 400;
// Max chat message length (chars)
const CHAT_MAX_LEN = 200;

// ─── Configuration snapshot (loaded once at startup) ─────────────────────
const DEFAULT_TIMERS = {
  'chess': { turnTimeoutMs: 600000 },
  'ludo': { turnTimeoutMs: 30000 },
  'snake-ladder': { turnTimeoutMs: 12000 },
  'scribble': { roundTimeoutMs: 80000 },
  'word-rush': { roundTimeoutMs: 90000 },
  'tap-rush': { gameDurationSeconds: 20 },
  'memory-grid': { roundTimeoutMs: 30000 },
};

const setupGameSocket = (io, gameNs) => {
  const getAccountNs = () => {
    try {
      const { getNamespace } = require('./index');
      return getNamespace('account');
    } catch { return null; }
  };
  const chatThrottle = new Map();

  const botHandler = new BotMatchHandler(
    gameNs,
    EVENTS,
    (mId, s) => _archiveMatch(mId, s),
    (ns, mId, gs, s) => _startTurnTimer(ns, mId, gs, s)
  );

  // ── BullMQ Worker for Distributed Timers ──────────────────────────────
  if (!io._timerWorkerInitialized) {
    io._timerWorkerInitialized = true;
    const { Worker } = require('bullmq');
    const Redis = require('ioredis');
    const config = require('../config/app.config');
    // BullMQ requires a SEPARATE connection for the Worker vs the Queue.
    // Sharing one connection causes deadlocks where the Worker blocks on
    // BLPOP while the Queue tries to write — ioredis pipelines can't fix it.
    const workerRedis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });

    new Worker('GameTimers', async (job) => {
      const { matchId, type, userId, gameSlug } = job.data;
      const latestState = await EventStore.loadMatchSnapshot(matchId);
      if (!latestState) return;

      if (type === 'reconnect') {
        if (latestState.status !== MATCH_STATES.PAUSED) return;
        if (!(latestState.disconnectedPlayers || []).includes(userId)) return;
        await _resolveReconnectTimeout(gameNs, matchId, gameSlug, userId, latestState);
      } else if (type === 'turn') {
        if (latestState.status !== MATCH_STATES.ACTIVE) return;

        // Use plugin-authoritative canPlayerAct to determine whose turn it is
        const plugin = GameRegistry.createInstance(gameSlug, latestState.metadata);
        const currentPlayerId = latestState.pluginState?.turnOrder?.[latestState.pluginState?.currentTurnIndex];
        if (!currentPlayerId) return;

        await EventStore.appendEvent(matchId, 'TURN_TIMEOUT', { userId: currentPlayerId }, currentPlayerId, (latestState.currentRevision || 0) + 1);
        latestState.currentRevision = (latestState.currentRevision || 0) + 1;

        // Plugin-authoritative: delegate timer expiry to the plugin.
        // Each plugin handles its own timeout behavior:
        //   Chess: timed-out player loses (forfeit)
        //   Ludo: auto-roll + auto-move first movable token
        //   Snake-Ladder: auto-roll
        latestState.pluginState = plugin.onTimerExpired(
          latestState.pluginState, 'turn', currentPlayerId
        );

        if (plugin.isFinished(latestState.pluginState)) {
          latestState.status = MATCH_STATES.FINISHED;
          latestState.winner = latestState.pluginState?.winner || null;
          TimerEngine.clearAllTimers(matchId);
          await EventStore.saveMatchSnapshot(matchId, latestState);
          gameNs.to(`match:${matchId}`).emit(EVENTS.SYNC, {
            state: latestState.pluginState,
            reason: 'turn_timeout',
            timedOutPlayer: currentPlayerId,
          });
          gameNs.to(`match:${matchId}`).emit(EVENTS.GAME_OVER, {
            state: latestState,
            winner: latestState.winner,
            reason: 'timeout',
          });
          botHandler.handleMatchEnd(matchId, gameSlug, latestState);
          await _archiveMatch(matchId, latestState);
          _notifySessionExpired(gameNs, matchId, latestState);
        } else {
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
          _notifySessionExpired(gameNs, matchId, latestState);
        } else {
          await EventStore.saveMatchSnapshot(matchId, latestState);
          const sockets = await gameNs.in(`match:${matchId}`).fetchSockets();
          for (const s of sockets) {
            const socketUserId = s.data?.userId || s.userId || (s.handshake?.auth?.userId);
            if (!socketUserId) continue;
            const ps = _getPlayerState(gameSlug, latestState, socketUserId);
            if (ps) {
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
    }, { connection: workerRedis }).on('failed', (job, err) => {
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
      const { rows } = await pool.query(
        `SELECT mm.user_id, mm.ws_token, mm.player_color, g.slug as game_slug, gm.metadata as match_metadata,
                u.name, u.username, m.cloudfront_url AS avatar
         FROM match_members mm
         JOIN users u ON u.id = mm.user_id
         LEFT JOIN media m ON m.id = u.avatar_url
         JOIN game_matches gm ON mm.match_id = gm.id
         JOIN game g ON gm.game_id = g.id
         WHERE mm.match_id = $1`,
        [matchId]
      );

      const myRow = rows.find(r => r.user_id === userId && r.ws_token === token);
      if (!myRow) return next(new Error('Invalid match credentials'));

      socket.matchId = matchId;
      socket.userId = userId;
      socket.gameSlug = myRow.game_slug;
      socket.matchPlayers = rows.map(r => ({
        userId: r.user_id,
        color: r.player_color,
        name: r.name,
        username: r.username,
        avatar: r.avatar,
      }));
      socket.matchMetadata = myRow.match_metadata || {};

      socket.lobbyBots = [];
      try {
        const lobbyRes = await pool.query(
          `SELECT settings FROM game_lobby WHERE id = $1`,
          [matchId]
        );
        const settings = lobbyRes.rows[0]?.settings || {};
        if (Array.isArray(settings.bots)) socket.lobbyBots = settings.bots;
      } catch (e) { /* matchId may not be a lobby id */ }

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

    let state;
    try {
      const players = [...(socket.matchPlayers || [])];
      botHandler.setupBotPlayer(socket, players);

      const seatSnaps = socket.matchMetadata?.playerSnapshots;
      if (Array.isArray(seatSnaps) && seatSnaps.length > 0) {
        const byId = new Map(players.map((p) => [String(p.userId ?? p.id), p]));
        const ordered = seatSnaps
          .map((s) => byId.get(String(s.id)))
          .filter((p) => !!p);
        const seen = new Set(ordered.map((p) => String(p.userId ?? p.id)));
        players.forEach((p) => {
          if (!seen.has(String(p.userId ?? p.id))) {
            ordered.push(p);
            seen.add(String(p.userId ?? p.id));
          }
        });
        players.length = 0;
        players.push(...ordered);
      }
      socket.matchPlayers = players;

      // Load state — prefer hot cache, then PG, then archived final state
      state = await EventStore.loadMatchSnapshot(matchId);
      if (!state) {
        try {
          const { rows } = await pool.query(
            `SELECT status, metadata->>'finalState' AS final_state
             FROM game_matches WHERE id = $1`,
            [matchId]
          );
          if (rows[0] && rows[0].status === 'COMPLETED' && rows[0].final_state) {
            state = JSON.parse(rows[0].final_state);
          }
        } catch (e) {
          // Non-fatal
        }
      }
      if (!state) {
        // Compute configSnapshot BEFORE loadOrInitializeMatch so it's included
        // in the initial state snapshot saved to EventStore/PG.
        const limits = await _loadEngineLimits(gameSlug);
        const configSnapshot = {
          ...DEFAULT_TIMERS[gameSlug],
          ...limits,
        };

        const result = await MatchManager.loadOrInitializeMatch(matchId, gameSlug, {
          players,
          maxPlayers: players.length || 2,
          matchMetadata: {
            ...socket.matchMetadata,
            configSnapshot,
          },
        });
        state = result.state;
        state.configSnapshot = configSnapshot;
      } else {
        // Reconnect: ensure configSnapshot is set from fresh limits
        const limits = await _loadEngineLimits(gameSlug);
        state.configSnapshot = {
          ...DEFAULT_TIMERS[gameSlug],
          ...limits,
        };
      }
    } catch (e) {
      socket.emit(EVENTS.ERROR, { message: `Failed to load match: ${e.message}` });
      return socket.disconnect();
    }

    try {
      const activeReconnectTimeout = RECONNECT_TIMEOUT_MS;

      // Handle reconnect for PAUSED matches
      if (state.status === MATCH_STATES.PAUSED) {
        const pausedAt = state.pausedAt || Date.now() - activeReconnectTimeout;
        if (Date.now() - pausedAt >= activeReconnectTimeout) {
          await _resolveReconnectTimeout(gameNs, matchId, gameSlug, userId, state);
          socket.emit(EVENTS.CONNECT_ACK, {
            matchId,
            gameSlug,
            state,
            status: MATCH_STATES.FINISHED,
            reconnectWindowMs: 0,
          });
          return socket.disconnect();
        } else {
          state.disconnectedPlayers = (state.disconnectedPlayers || []).filter(id => id !== userId);
          // Cancel this player's reconnect timer — they're back, no need to
          // resolve them as timed-out. Without this, orphaned timers pile up.
          await TimerEngine.clearTimer(matchId, `reconnect:${userId}`);
          const realPlayerIds = (state.players || state.metadata?.players || [])
            .filter(p => !p.isBot && !String(p.userId || p.id || '').startsWith('bot_'))
            .map(p => p.userId || p.id);
          const stillOffline = (state.disconnectedPlayers || []).filter(id => realPlayerIds.includes(id));

          if (stillOffline.length === 0) {
            state.status = MATCH_STATES.ACTIVE;
            state.pausedAt = null;
            state.disconnectTimestamps = {};
            await EventStore.saveMatchSnapshot(matchId, state);
            gameNs.to(matchRoom).emit(EVENTS.RESUME, { userId });
            botHandler.handleResume(matchId, gameSlug, state);
            _startTurnTimer(gameNs, matchId, gameSlug, state);
          } else {
            state.pausedAt = state.pausedAt || Date.now();
            await EventStore.saveMatchSnapshot(matchId, state);
            // Calculate remaining time per-player — each offline player has
            // their own disconnect timestamp, so their countdown is independent.
            const now = Date.now();
            let minRemainingMs = activeReconnectTimeout;
            for (const offlineId of stillOffline) {
              const ts = (state.disconnectTimestamps || {})[offlineId] || state.pausedAt || now;
              const remaining = Math.max(0, activeReconnectTimeout - (now - ts));
              if (remaining < minRemainingMs) minRemainingMs = remaining;
            }
            gameNs.to(matchRoom).emit(EVENTS.PAUSE, {
              reason: 'player_disconnected',
              userId: stillOffline[0],
              reconnectWindowMs: minRemainingMs,
              disconnectedPlayers: stillOffline,
              disconnectDetails: stillOffline.map(pid => ({
                userId: pid,
                remainingMs: Math.max(0, activeReconnectTimeout - (now - ((state.disconnectTimestamps || {})[pid] || state.pausedAt || now))),
              })),
            });
          }
        }
      }

      let reconnectWindowMs = 0;
      if (state.status === MATCH_STATES.PAUSED) {
        // Use per-player timestamp for this specific user's remaining time.
        const myTs = (state.disconnectTimestamps || {})[userId] || state.pausedAt || Date.now();
        reconnectWindowMs = Math.max(0, activeReconnectTimeout - (Date.now() - myTs));
      }

      // Include round context for multi-round matches
      let roundContext = null;
      try {
        const RoundManager = require('../modules/game/engine/RoundManager');
        roundContext = await RoundManager.getRoundContext(matchId);
      } catch { /* rounds table may not exist yet */ }

      socket.emit(EVENTS.CONNECT_ACK, {
        matchId,
        gameSlug,
        state,
        status: state.status || MATCH_STATES.WAITING,
        reconnectWindowMs,
        round: roundContext,
      });

      if (state.status === MATCH_STATES.ACTIVE) {
        await TimerEngine.clearTimer(matchId, `reconnect:${userId}`);
      }

      // ── PING / PONG ───────────────────────────────────────────────────
      socket.on(EVENTS.PING, () => {
        socket.emit(EVENTS.PONG, { ts: Date.now() });
      });

      // ── CHAT ──────────────────────────────────────────────────────────
      socket.on(EVENTS.CHAT, async (chatData) => {
        try {
          // Rate limit check
          const chatAllowed = await EventStore.checkRateLimit(
            userId, 'chat', RATE_LIMIT_CHAT.limit, RATE_LIMIT_CHAT.windowSec
          );
          if (!chatAllowed) return;

          const text = String(chatData?.text || '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LEN);
          if (!text) return;

          const now = Date.now();
          const last = chatThrottle.get(userId) || 0;
          if (now - last < CHAT_THROTTLE_MS) return;
          chatThrottle.set(userId, now);

          const roster = socket.matchPlayers || [];
          const sender = roster.find(
            (p) => String(p.userId || p.id || '') === String(userId)
          );
          const name = String(
            sender?.name || sender?.username || chatData?.name || 'Player'
          ).slice(0, 40);
          const avatar = sender?.avatar || sender?.avatarUrl || chatData?.avatar || null;

          gameNs.to(matchRoom).emit(EVENTS.CHAT, {
            userId,
            name,
            avatar,
            text,
            ts: now,
          });
        } catch (e) {
          socket.emit(EVENTS.ERROR, { message: 'Chat failed' });
        }
      });

      // ── READY ─────────────────────────────────────────────────────────
      socket.on(EVENTS.READY, async () => {
        try {
          let snap = await EventStore.loadMatchSnapshot(matchId);
          if (!snap) snap = state;

          // Propagate configSnapshot from the connection handler's state.
          // configSnapshot is set on the connection handler but NOT persisted
          // to EventStore during loadOrInitializeMatch — it's only set after
          // the initial save. Ensure the snap always has it.
          if (!snap.configSnapshot) {
            snap.configSnapshot = state.configSnapshot || snap.metadata?.configSnapshot || {};
          }

          if (!snap.readyPlayers) snap.readyPlayers = [];
          if (!snap.readyPlayers.includes(userId)) snap.readyPlayers.push(userId);

          const realPlayerCount = (socket.matchPlayers || [])
            .filter(p => !String(p.userId || '').startsWith('bot_')).length;
          const isBotMatch = (socket.matchPlayers || [])
            .some(p => p.isBot || String(p.userId || '').startsWith('bot_'));
          const requiredReady = realPlayerCount === 1 ? 1 : Math.max(1, realPlayerCount);
          const allReady = snap.readyPlayers.length >= requiredReady;

          if (allReady && snap.status !== MATCH_STATES.ACTIVE) {
            snap.status = MATCH_STATES.ACTIVE;
            snap.startedAt = Date.now();
            snap.isBotMatch = isBotMatch;
            snap.currentRevision = (snap.currentRevision || 0) + 1;

            // Append GAME_START event
            await EventStore.appendEvent(matchId, 'GAME_START', {}, userId, snap.currentRevision);

            // Plugin lifecycle: onMatchStart hook
            const startPlugin = GameRegistry.createInstance(gameSlug, {
              ...(snap.metadata || {}),
              configSnapshot: snap.configSnapshot || snap.metadata?.configSnapshot || {},
            });
            snap.pluginState = startPlugin.onMatchStart(snap.pluginState);

            // Persist configSnapshot into the saved snapshot so subsequent
            // loads (reconnect, MOVE handler) always have it.
            snap.configSnapshot = snap.configSnapshot || state.configSnapshot || {};

            // Save snapshot
            await EventStore.saveMatchSnapshot(matchId, snap);

            const sockets = await gameNs.in(matchRoom).fetchSockets();
            for (const s of sockets) {
              const playerState = _getPlayerState(gameSlug, snap, s.userId);
              s.emit(EVENTS.START, { state: playerState, startedAt: snap.startedAt });
            }

            console.info(`[GameEngine] Match ${matchId} started — isBotMatch=${isBotMatch}`);

            botHandler.handleMatchStart(matchId, gameSlug, snap);

            // ── Round lifecycle: create Round 1 if multi-round match ──
            const configuredRounds = snap.configured_rounds || 1;
            if (configuredRounds > 1) {
              try {
                const RoundManager = require('../modules/game/engine/RoundManager');
                const roundDef = await RoundManager.createNextRound(
                  matchId, configuredRounds, startPlugin, snap
                );
                if (roundDef) {
                  await RoundManager.markLoading(roundDef.roundId);
                  gameNs.to(matchRoom).emit(EVENTS.ROUND_CREATED, {
                    eventId: `round_created_${roundDef.roundId}`,
                    matchId,
                    round: roundDef,
                  });
                }
              } catch (e) {
                console.error('[GameEngine] Failed to create Round 1:', e.message);
              }
            }

            _startTurnTimer(gameNs, matchId, gameSlug, snap);
          } else {
            await EventStore.saveMatchSnapshot(matchId, snap);
            gameNs.to(matchRoom).emit(EVENTS.STATE, { state: snap });
          }
        } catch (e) {
          socket.emit(EVENTS.ERROR, { message: e.message });
        }
      });

      // ── MOVE ──────────────────────────────────────────────────────────
      socket.on(EVENTS.MOVE, async (moveData) => {
        try {
          // Rate limit check
          const moveAllowed = await EventStore.checkRateLimit(
            userId, 'move', RATE_LIMIT_MOVE.limit, RATE_LIMIT_MOVE.windowSec
          );
          if (!moveAllowed) {
            socket.emit(EVENTS.ERROR, { message: 'Rate limit exceeded' });
            return;
          }

          // Broadcast-only events (strokes, clears)
          if (moveData.type === 'STROKE_CHUNK' || moveData.type === 'STROKE_END' || moveData.type === 'CLEAR') {
            socket.to(matchRoom).emit(EVENTS.SYNC, { type: moveData.type, ...moveData, userId });
            return;
          }

          // Remap Scribble guess
          if (moveData.type === 'GUESS' && moveData.text && !moveData.word) {
            moveData.word = moveData.text;
          }

          // Always generate server-side UUID — client-provided commandIds
          // are rejected because game_commands.command_id is UUID and a
          // client-controlled id could be reused to bypass idempotency.
          const commandId = crypto.randomUUID();

          const updatedState = await MatchManager.handlePlayerMove(
            matchId, gameSlug, userId, moveData, commandId
          );

          if (updatedState.status === MATCH_STATES.FINISHED) {
            TimerEngine.clearAllTimers(matchId);

            // ── Round lifecycle: check if multi-round ──
            const configuredRounds = updatedState.configured_rounds || 1;
            const finishPlugin = GameRegistry.createInstance(gameSlug, {
              ...(updatedState.metadata || {}),
              configSnapshot: updatedState.configSnapshot || updatedState.metadata?.configSnapshot || {},
            });
            const roundResult = typeof finishPlugin.getRoundResult === 'function'
              ? finishPlugin.getRoundResult(updatedState.pluginState || updatedState)
              : { winner: updatedState.pluginState?.winner || null, standings: [] };

            const matchFullyFinished = await _handleRoundFinish(
              matchId, gameSlug, updatedState, finishPlugin, roundResult
            );

            if (matchFullyFinished) {
              // Single round or last round — emit GAME_OVER + MATCH_FINISHED
              gameNs.to(matchRoom).emit(EVENTS.GAME_OVER, {
                state: updatedState,
                winner: updatedState.pluginState?.winner || null,
              });
              gameNs.to(matchRoom).emit(EVENTS.MATCH_FINISHED, {
                eventId: `match_finished_${matchId}`,
                matchId,
                result: {
                  winner: updatedState.pluginState?.winner || null,
                  roundResult,
                },
              });
              botHandler.handleMatchEnd(matchId, gameSlug, updatedState);
              await _archiveMatch(matchId, updatedState);
              _notifySessionExpired(gameNs, matchId, updatedState);
            }
            // If more rounds, _handleRoundFinish already created next round
            // and emitted ROUND_CREATED. Don't archive — match continues.
          } else {
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
            // Restart timers only for turn-based and simultaneous games.
            // Round-based games (scribble, word-rush, memory-grid) have timers
            // managed by the timer worker — restarting on every move would reset
            // the round clock.
            const movePlugin = GameRegistry.createInstance(gameSlug, updatedState.metadata);
            const execModel = movePlugin.constructor.EXECUTION_MODEL;
            if (execModel === 'turn-based' || execModel === 'simultaneous') {
              _startTurnTimer(gameNs, matchId, gameSlug, updatedState);
            }

            // Trigger bot turns for non-turn-based games after each human move.
            // Turn-based bots are triggered by _startTurnTimer when it detects
            // the bot is the current player.
            if (updatedState.isBotMatch && !movePlugin.isTurnBased()) {
              botHandler.handleTurn(matchId, gameSlug, updatedState);
            }
          }
        } catch (e) {
          socket.emit(EVENTS.ERROR, { message: e.message });
        }
      });

      // ── LEAVE ─────────────────────────────────────────────────────────
      // Explicit leave = forfeit. The player loses immediately. No reconnect
      // grace period. This is different from 'disconnect' which pauses and
      // gives the player a chance to rejoin.
      socket.on(EVENTS.LEAVE, async () => {
        await _handleLeave(gameNs, socket, matchRoom);
      });

      // ── ROUND_READY (client confirms assets loaded for current round) ──
      socket.on(EVENTS.ROUND_READY, async (data) => {
        try {
          const { roundId } = data || {};
          if (!roundId) return;

          const RoundManager = require('../modules/game/engine/RoundManager');
          const round = await RoundManager.getRoundById(roundId);
          if (!round || round.match_id !== matchId) return;

          // Late-joiner guard: if the round is already ACTIVE or FINISHED,
          // this ROUND_READY is from a reconnecting player who missed the
          // round start. Ignore it — the round is already in progress.
          if (round.status === 'ACTIVE' || round.status === 'FINISHED' || round.status === 'READY') {
            console.info(`[GameEngine] ROUND_READY for ${roundId} ignored — round already ${round.status}`);
            return;
          }

          // Track who is ready
          if (!gameNs.roundReadyPlayers) gameNs.roundReadyPlayers = {};
          if (!gameNs.roundReadyPlayers[roundId]) gameNs.roundReadyPlayers[roundId] = new Set();
          gameNs.roundReadyPlayers[roundId].add(userId);

          // Check if all real players are ready
          const state = await EventStore.loadMatchSnapshot(matchId);
          const players = state?.players || state?.metadata?.players || [];
          const realPlayers = players.filter(p =>
            !p.isBot && !String(p.userId || p.id || '').startsWith('bot_')
          );
          const requiredCount = Math.max(1, realPlayers.length);
          const readyCount = gameNs.roundReadyPlayers[roundId].size;

          if (readyCount >= requiredCount) {
            // All ready — start the round. Clean up any stale ready
            // tracking for OTHER rounds (shouldn't happen, but safety).
            for (const staleId of Object.keys(gameNs.roundReadyPlayers)) {
              if (staleId !== roundId) delete gameNs.roundReadyPlayers[staleId];
            }
            delete gameNs.roundReadyPlayers[roundId];
            await RoundManager.markReady(roundId);
            await RoundManager.markActive(roundId);
            gameNs.to(matchRoom).emit(EVENTS.ROUND_STARTED, {
              eventId: `round_started_${roundId}`,
              matchId,
              round: {
                roundId: round.id,
                number: round.round_number,
                total: state.configured_rounds || 1,
                status: 'ACTIVE',
              },
            });
            console.info(`[GameEngine] Round ${round.round_number} started for match ${matchId}`);
          }
        } catch (e) {
          console.error('[GameEngine] Error handling ROUND_READY:', e.message);
        }
      });

      // ── Disconnect ────────────────────────────────────────────────────
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

  /**
   * Explicit leave — the player chose to forfeit. Unlike _handleDisconnect,
   * this immediately ends the match (the leaving player loses) with no reconnect
   * grace period. The match will NOT appear as "resume" for the leaving player.
   */
  async function _handleLeave(ns, socket, matchRoom) {
    const { matchId, userId, gameSlug } = socket;
    try {
      const state = await EventStore.loadMatchSnapshot(matchId);
      if (!state || state.status === MATCH_STATES.FINISHED || state.status === MATCH_STATES.ARCHIVED) return;

      // Find the winner (anyone who isn't the leaving player)
      const players = state.players || state.metadata?.players || [];
      const winner = players.find(p => {
        const pid = p?.userId || p?.id;
        return pid && pid !== userId && !String(pid).startsWith('bot_');
      });
      const winnerId = winner ? (winner.userId || winner.id) : null;

      // Mark match as finished
      state.status = MATCH_STATES.FINISHED;
      state.winner = winnerId;
      state.disconnectTimestamps = {};
      state.currentRevision = (state.currentRevision || 0) + 1;
      if (state.pluginState) {
        state.pluginState.status = 'finished';
        state.pluginState.winner = winnerId;
        state.pluginState.drawReason = 'forfeit';
      }

      await EventStore.saveMatchSnapshot(matchId, state);
      await EventStore.appendEvent(matchId, 'FORFEIT', { userId, winner: winnerId }, userId, state.currentRevision);

      // Notify all connected players
      ns.to(matchRoom).emit(EVENTS.GAME_OVER, {
        state,
        winner: winnerId,
        reason: 'forfeit',
        forfeitedBy: userId,
      });

      // Cleanup
      await TimerEngine.clearAllTimers(matchId);
      botHandler.handleMatchEnd(matchId, gameSlug, state);
      await _archiveMatch(matchId, state);

      // Resolve the leaving player's session as LOSS (forfeit = 0 XP)
      await _resolvePlayerSession({ matchId, userId, result: 'LOSS', score: 0, xpEarned: 0 });
      // Resolve the winner's session as WIN (opponent forfeited)
      if (winnerId && !String(winnerId).startsWith('bot_')) {
        const GameRegistry = require('../modules/game/engine');
        let winXp = 10;
        try {
          const plugin = GameRegistry.createInstance(gameSlug, { metadata: {}, configSnapshot: {} });
          winXp = plugin.calculateReward({}, winnerId).xpEarned || 10;
        } catch {}
        await _resolvePlayerSession({ matchId, userId: winnerId, result: 'WIN', score: 1, xpEarned: winXp });
      }

      _notifySessionExpired(ns, matchId, state);
    } catch (err) {
      console.error('[GameEngine] Error in _handleLeave:', err);
    }
  }

  async function _handleDisconnect(ns, socket, matchRoom) {
    const { matchId, userId, gameSlug } = socket;
    const activeReconnectTimeout = RECONNECT_TIMEOUT_MS;

    try {
      const liveSockets = await ns.in(matchRoom).fetchSockets();
      const hasOtherSocket = liveSockets.some(s => (s.data?.userId || s.userId) === userId);
      if (hasOtherSocket) return;
    } catch (e) { /* fall through */ }

    const state = await EventStore.loadMatchSnapshot(matchId);
    if (!state) return;

    // Match already finished — nothing to pause or time out.
    if (state.status === MATCH_STATES.FINISHED || state.status === MATCH_STATES.ARCHIVED) return;

    // Per-player disconnect timestamps — each player gets their own countdown.
    // This ensures Player A disconnecting at T0 and Player B at T10 each get
    // a full 60s window independently.
    if (!state.disconnectTimestamps) state.disconnectTimestamps = {};

    if (state.status === MATCH_STATES.ACTIVE) {
      state.disconnectedPlayers = [...new Set([...(state.disconnectedPlayers || []), userId])];
      state.disconnectTimestamps[userId] = Date.now();
      if (state.readyPlayers) {
        state.readyPlayers = state.readyPlayers.filter(id => id !== userId);
      }
      // ALWAYS pause on disconnect — give every player a 60s grace period.
      state.status = MATCH_STATES.PAUSED;
      state.pausedAt = Date.now();
      await EventStore.saveMatchSnapshot(matchId, state);
      ns.to(matchRoom).emit(EVENTS.PAUSE, {
        reason: 'player_disconnected',
        userId,
        reconnectWindowMs: activeReconnectTimeout,
        disconnectedPlayers: state.disconnectedPlayers,
        disconnectDetails: (state.disconnectedPlayers || []).map(id => ({
          userId: id,
          remainingMs: Math.max(0, activeReconnectTimeout - (Date.now() - ((state.disconnectTimestamps || {})[id] || Date.now()))),
        })),
      });
      botHandler.handlePause(matchId, gameSlug, state);
    } else if (state.status === MATCH_STATES.PAUSED) {
      // Already paused — add this player's disconnect timestamp.
      // Don't reset pausedAt (the global pause started earlier).
      // Don't overwrite if already tracked (idempotent).
      if (!state.disconnectedPlayers?.includes(userId)) {
        state.disconnectedPlayers = [...new Set([...(state.disconnectedPlayers || []), userId])];
        state.disconnectTimestamps[userId] = Date.now();
        await EventStore.saveMatchSnapshot(matchId, state);
        // Calculate remaining time for OTHER still-offline players
        // (not the new disconnectee — they get their own fresh window).
        const now = Date.now();
        for (const offlineId of state.disconnectedPlayers) {
          if (offlineId === userId) continue;
          const ts = state.disconnectTimestamps[offlineId] || state.pausedAt || now;
          const remainingMs = Math.max(0, activeReconnectTimeout - (now - ts));
          // If any still-offline player has remaining time, emit PAUSE with
          // the minimum remaining across all still-offline players.
          // Emit PAUSE with per-player details for N-player support.
          ns.to(matchRoom).emit(EVENTS.PAUSE, {
            reason: 'player_disconnected',
            userId,
            reconnectWindowMs: remainingMs,
            disconnectedPlayers: state.disconnectedPlayers,
            disconnectDetails: (state.disconnectedPlayers || []).map(pid => ({
              userId: pid,
              remainingMs: Math.max(0, activeReconnectTimeout - (now - ((state.disconnectTimestamps || {})[pid] || state.pausedAt || now))),
            })),
          });
          break; // one PAUSE event is enough — clients get the full list
        }
      }
    } else if (state.status === MATCH_STATES.WAITING) {
      state.disconnectedPlayers = [...new Set([...(state.disconnectedPlayers || []), userId])];
      state.disconnectTimestamps[userId] = Date.now();
      if (state.readyPlayers) {
        state.readyPlayers = state.readyPlayers.filter(id => id !== userId);
      }
      await EventStore.saveMatchSnapshot(matchId, state);
      ns.to(matchRoom).emit(EVENTS.STATE, { state });
    }

    // Per-player reconnect timer: use THIS player's remaining window,
    // not the full 60s. If they disconnected during an existing pause,
    // their timer should fire when THEIR window expires.
    let reconnectDelayMs = activeReconnectTimeout;
    if (state.disconnectTimestamps?.[userId]) {
      const elapsed = Date.now() - state.disconnectTimestamps[userId];
      reconnectDelayMs = Math.max(1000, activeReconnectTimeout - elapsed);
    }
    await TimerEngine.startTimer(matchId, `reconnect:${userId}`, reconnectDelayMs, {
      type: 'reconnect',
      userId,
      gameSlug,
    });
  }

  async function _resolveReconnectTimeout(ns, matchId, gameSlug, userId, state) {
    if (!state || state.status !== MATCH_STATES.PAUSED) return;

    // Atomic guard: re-load from DB to prevent two racing timers from
    // double-resolving the same match. If state already moved past PAUSED,
    // someone else got there first — bail.
    const fresh = await EventStore.loadMatchSnapshot(matchId);
    if (!fresh || fresh.status !== MATCH_STATES.PAUSED) return;
    // Use the fresh state going forward.
    state = fresh;

    // Clear THIS player's reconnect timer. Do NOT clear all timers —
    // other offline players still need their own timers to fire and resolve.
    await TimerEngine.clearTimer(matchId, `reconnect:${userId}`);

    const players = state.players || state.metadata?.players || [];
    const realPlayers = players.filter(p => !String(p.userId || p.id || '').startsWith('bot_'));
    const realIds = realPlayers.map(p => p.userId || p.id);
    const offline = state.disconnectedPlayers || [];

    const everyoneOffline = realIds.length >= 2 && realIds.every(id => offline.includes(id));
    if (everyoneOffline) {
      state.status = MATCH_STATES.FINISHED;
      state.winner = null;
      state.pausedAt = null;
      state.disconnectTimestamps = {};
      if (state.pluginState) {
        state.pluginState.status = 'finished';
        state.pluginState.winner = null;
        state.pluginState.drawReason = 'all_offline';
      }
      await EventStore.saveMatchSnapshot(matchId, state);
      state.currentRevision = (state.currentRevision || 0) + 1;
      await EventStore.appendEvent(matchId, 'DRAW', { reason: 'all_offline' }, null, state.currentRevision);
      gameNs.to(`match:${matchId}`).emit(EVENTS.GAME_OVER, { state, reason: 'draw' });
      botHandler.handleMatchEnd(matchId, gameSlug, state);
      await _archiveMatch(matchId, state);
      // Draw refunds entry fee as XP — players don't lose their entry.
      let drawXp = 0;
      try {
        const gameRepo = require('../modules/game/game.repository');
        const gameRow = await gameRepo.findGameById({ id: state.game_id || matchId });
        drawXp = Number(gameRow?.metadata?.entryFee) || 5;
      } catch {}
      for (const rid of realIds) {
        await _resolvePlayerSession({ matchId, userId: rid, result: 'DRAW', score: 0, xpEarned: drawXp });
      }
      _notifySessionExpired(gameNs, matchId, state);
      return;
    }

    if (realIds.length === 2) {
      const otherId = realIds.find(id => id !== userId) || null;
      state.status = MATCH_STATES.FINISHED;
      state.winner = otherId;
      state.pausedAt = null;
      state.disconnectTimestamps = {};
      if (state.pluginState) {
        state.pluginState.status = 'finished';
        state.pluginState.winner = otherId;
        state.pluginState.drawReason = 'forfeit';
      }
      await EventStore.saveMatchSnapshot(matchId, state);
      state.currentRevision = (state.currentRevision || 0) + 1;
      await EventStore.appendEvent(matchId, 'FORFEIT', { userId, winner: otherId }, userId, state.currentRevision);
      gameNs.to(`match:${matchId}`).emit(EVENTS.GAME_OVER, {
        state, reason: 'forfeit', winner: otherId, forfeitedBy: userId,
      });
      botHandler.handleMatchEnd(matchId, gameSlug, state);
      await _archiveMatch(matchId, state);
      await _resolvePlayerSession({ matchId, userId, result: 'LOSS', score: 0, xpEarned: 0 });
      _notifySessionExpired(gameNs, matchId, state);
      return;
    }

    if (realIds.length === 1) {
      const bot = players.find(p => String(p.userId || p.id || '').startsWith('bot_'));
      const winnerId = bot ? (bot.userId || bot.id) : null;
      state.status = MATCH_STATES.FINISHED;
      state.winner = winnerId;
      state.pausedAt = null;
      state.disconnectTimestamps = {};
      if (state.pluginState) {
        state.pluginState.status = 'finished';
        state.pluginState.winner = winnerId;
        state.pluginState.drawReason = 'forfeit';
      }
      await EventStore.saveMatchSnapshot(matchId, state);
      state.currentRevision = (state.currentRevision || 0) + 1;
      await EventStore.appendEvent(matchId, 'FORFEIT', { userId, winner: winnerId }, userId, state.currentRevision);
      gameNs.to(`match:${matchId}`).emit(EVENTS.GAME_OVER, {
        state, reason: 'forfeit', winner: winnerId, forfeitedBy: userId,
      });
      botHandler.handleMatchEnd(matchId, gameSlug, state);
      await _archiveMatch(matchId, state);
      await _resolvePlayerSession({ matchId, userId, result: 'LOSS', score: 0, xpEarned: 0 });
      _notifySessionExpired(gameNs, matchId, state);
      return;
    }

    // 3+ players → remove the offline player and continue (or auto-win if last)
    state.disconnectedPlayers = offline.filter(id => id !== userId);
    if (state.disconnectTimestamps) delete state.disconnectTimestamps[userId];
    state.players = (state.players || []).filter(p => (p.userId || p.id) !== userId);
    if (state.metadata?.players) {
      state.metadata.players = state.metadata.players.filter(p => (p.userId || p.id) !== userId);
    }
    if (state.readyPlayers) {
      state.readyPlayers = state.readyPlayers.filter(id => id !== userId);
    }
    if (state.pluginState) {
      if (Array.isArray(state.pluginState.turnOrder)) {
        const idx = state.pluginState.turnOrder.indexOf(userId);
        state.pluginState.turnOrder = state.pluginState.turnOrder.filter(id => id !== userId);
        const len = state.pluginState.turnOrder.length;
        if (len > 0 && state.pluginState.currentTurnIndex != null) {
          if (idx >= 0 && idx < state.pluginState.currentTurnIndex) {
            state.pluginState.currentTurnIndex -= 1;
          } else if (idx === state.pluginState.currentTurnIndex) {
            state.pluginState.currentTurnIndex = state.pluginState.currentTurnIndex % len;
          }
        }
      }
      if (state.pluginState.scores) delete state.pluginState.scores[userId];
    }
    await EventStore.saveMatchSnapshot(matchId, state);
    state.currentRevision = (state.currentRevision || 0) + 1;
    await EventStore.appendEvent(matchId, 'PLAYER_REMOVED', { userId }, userId, state.currentRevision);
    await _resolvePlayerSession({ matchId, userId, result: 'LOSS', score: 0, xpEarned: 0 });
    _notifySessionExpired(gameNs, matchId, state);

    const remainingReal = (state.players || state.metadata?.players || [])
      .filter(p => !String(p.userId || p.id || '').startsWith('bot_'))
      .map(p => p.userId || p.id);
    const stillOffline = (state.disconnectedPlayers || []).filter(id => remainingReal.includes(id));

    // Last player standing — auto-win the match
    if (remainingReal.length <= 1 && stillOffline.length === 0) {
      const winnerId = remainingReal[0] || null;
      state.status = MATCH_STATES.FINISHED;
      state.winner = winnerId;
      state.pausedAt = null;
      state.disconnectTimestamps = {};
      if (state.pluginState) {
        state.pluginState.status = 'finished';
        state.pluginState.winner = winnerId;
        state.pluginState.drawReason = 'last_player_standing';
      }
      await EventStore.saveMatchSnapshot(matchId, state);
      state.currentRevision = (state.currentRevision || 0) + 1;
      await EventStore.appendEvent(matchId, 'FORFEIT', { reason: 'last_player_standing', winner: winnerId }, null, state.currentRevision);
      gameNs.to(`match:${matchId}`).emit(EVENTS.GAME_OVER, { state, reason: 'forfeit', winner: winnerId });
      botHandler.handleMatchEnd(matchId, gameSlug, state);
      await _archiveMatch(matchId, state);
      // Winner gets WIN XP
      if (winnerId) {
        let winXp = 10;
        try {
          const GameRegistry = require('../modules/game/engine');
          const plugin = GameRegistry.createInstance(gameSlug, { metadata: {}, configSnapshot: {} });
          winXp = plugin.calculateReward({}, winnerId).xpEarned || 10;
        } catch {}
        await _resolvePlayerSession({ matchId, userId: winnerId, result: 'WIN', score: 1, xpEarned: winXp });
      }
      _notifySessionExpired(gameNs, matchId, state);
      return;
    }

    if (stillOffline.length === 0) {
      state.status = MATCH_STATES.ACTIVE;
      state.pausedAt = null;
      state.disconnectTimestamps = {};
      await EventStore.saveMatchSnapshot(matchId, state);
      const sockets = await ns.in(`match:${matchId}`).fetchSockets();
      for (const s of sockets) {
        const sid = s.data?.userId || s.userId;
        const ps = _getPlayerState(gameSlug, state, sid);
        s.emit(EVENTS.SYNC, { state: ps.pluginState, reason: 'player_removed', removedPlayer: userId });
      }
      ns.to(`match:${matchId}`).emit(EVENTS.RESUME, { removedPlayer: userId });
      botHandler.handleResume(matchId, gameSlug, state);
      _startTurnTimer(ns, matchId, gameSlug, state);
    } else {
      // Calculate remaining time from per-player timestamps.
      // Find the MINIMUM remaining time across all still-offline players
      // so clients see the correct countdown for the tightest deadline.
      const now = Date.now();
      let minRemainingMs = RECONNECT_TIMEOUT_MS;
      for (const offlineId of stillOffline) {
        const ts = (state.disconnectTimestamps || {})[offlineId] || state.pausedAt || now;
        const remaining = Math.max(0, RECONNECT_TIMEOUT_MS - (now - ts));
        if (remaining < minRemainingMs) minRemainingMs = remaining;
      }
      ns.to(`match:${matchId}`).emit(EVENTS.PAUSE, {
        reason: 'player_disconnected',
        userId: stillOffline[0],
        reconnectWindowMs: minRemainingMs,
        disconnectedPlayers: stillOffline,
        disconnectDetails: stillOffline.map(pid => ({
          userId: pid,
          remainingMs: Math.max(0, RECONNECT_TIMEOUT_MS - (now - ((state.disconnectTimestamps || {})[pid] || state.pausedAt || now))),
        })),
      });
    }
  }

  async function _resolvePlayerSession({ matchId, userId, result, score = 0, xpEarned = 0 }) {
    try {
      const repo = require('../modules/game/game.repository');
      const { rows } = await pool.query(
        `SELECT id, game_id, metadata FROM game_sessions
         WHERE metadata->>'matchGroupId' = $1 AND user_id = $2
           AND status IN ('ACTIVE','PENDING')
         ORDER BY started_at DESC LIMIT 1`,
        [matchId, userId]
      );
      const session = rows[0];
      if (!session) return;
      await repo.updateGameSessionStatus({
        sessionId: session.id,
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
      });
      await repo.recordMatchHistory({
        userId,
        gameId: session.game_id,
        mode: session.metadata?.mode,
        result,
        score,
        duration: 60,
        xpEarned,
        matchGroupId: matchId,
      });
      // Credit XP for wins in engine-resolved matches (forfeit, timeout)
      if (xpEarned > 0) {
        try {
          const xpSvc = require('../modules/xp/xp.service');
          await xpSvc.creditXP({
            userId, xp: xpEarned,
            transactionType: 'earned', sourceType: `game_forfeit_${matchId}`
          });
        } catch (xpErr) {
          console.error(`[GameEngine] Failed to credit XP for ${userId}:`, xpErr.message);
        }
      }
    } catch (e) {
      console.error(`[GameEngine] Failed to resolve session for ${userId} in ${matchId}:`, e.message);
    }
  }

  function _startTurnTimer(ns, matchId, gameSlug, state) {
    try {
      // Pass configSnapshot from top-level state so the plugin gets correct timer durations
      const matchData = { ...(state.metadata || {}), configSnapshot: state.configSnapshot || state.metadata?.configSnapshot || {} };
      const plugin = GameRegistry.createInstance(gameSlug, matchData);

      // Plugin-authoritative: get timers from the plugin
      const timers = plugin.getTimers(state.pluginState || state);
      if (timers.length === 0) return;

      const turnTimer = timers.find(t => t.type === 'turn');
      const roundTimer = timers.find(t => t.type === 'round');

      if (turnTimer) {
        // Turn-based games
        const currentPlayerId = state.pluginState?.turnOrder?.[state.pluginState?.currentTurnIndex];
        if (!currentPlayerId) {
          console.warn(`[GameEngine] _startTurnTimer: no currentPlayerId for ${matchId}`);
          return;
        }

        TimerEngine.clearTimer(matchId, 'turn').then(() => {
          if (currentPlayerId.startsWith('bot_')) {
            console.info(`[GameEngine] Triggering bot turn: ${currentPlayerId} in ${matchId}`);
            botHandler.handleTurn(matchId, gameSlug, state, currentPlayerId);
            return;
          }
          TimerEngine.startTimer(matchId, 'turn', turnTimer.durationMs, {
            type: 'turn',
            gameSlug,
          });
        }).catch(err => {
          console.error(`[GameEngine] clearTimer failed for ${matchId}:`, err.message);
          // Still trigger bot even if clearTimer fails
          if (currentPlayerId.startsWith('bot_')) {
            botHandler.handleTurn(matchId, gameSlug, state, currentPlayerId);
          }
        });
      } else if (roundTimer) {
        // Round-based games
        botHandler.handleTurn(matchId, gameSlug, state);
        TimerEngine.startTimer(matchId, 'round', roundTimer.durationMs, {
          type: 'round',
          gameSlug,
        });
      }
    } catch (err) {
      console.error('[GameEngine] Error in _startTurnTimer:', err);
    }
  }

  function _getPlayerState(gameSlug, fullState, playerId) {
    if (!fullState.pluginState) return fullState;
    const plugin = GameRegistry.createInstance(gameSlug, fullState.metadata || {});
    const filteredPs = plugin.getPlayerState(fullState.pluginState, playerId);
    return { ...fullState, pluginState: filteredPs };
  }

  /**
   * Handle round finish for multi-round matches.
   * Returns true if match is fully finished (last round), false if more rounds pending.
   */
  async function _handleRoundFinish(matchId, gameSlug, state, plugin, roundResult) {
    try {
      const RoundManager = require('../modules/game/engine/RoundManager');
      const configuredRounds = state.configured_rounds || 1;

      if (configuredRounds <= 1) return true; // single round — match is done

      const currentRoundNum = state.current_round_number || 1;
      const round = await RoundManager.getCurrentRound(matchId);
      if (!round) return true;

      // Finish current round with result
      await RoundManager.markFinished(round.id, roundResult);

      // Emit ROUND_FINISHED
      gameNs.to(`match:${matchId}`).emit(EVENTS.ROUND_FINISHED, {
        eventId: `round_finished_${round.id}`,
        matchId,
        round: {
          roundId: round.id,
          number: round.round_number,
          total: configuredRounds,
          status: 'FINISHED',
        },
        result: roundResult,
      });

      // Check if more rounds
      if (currentRoundNum >= configuredRounds) {
        // Last round — match is done
        return true;
      }

      // Create next round
      const matchData = {
        ...(state.metadata || {}),
        configSnapshot: state.configSnapshot || state.metadata?.configSnapshot || {},
        assetSetId: state.assetSetId,
        assetManifestVersion: state.assetManifestVersion || 1,
      };
      const nextRound = await RoundManager.createNextRound(
        matchId, configuredRounds, plugin, matchData
      );

      if (nextRound) {
        await RoundManager.markLoading(nextRound.roundId);
        gameNs.to(`match:${matchId}`).emit(EVENTS.ROUND_CREATED, {
          eventId: `round_created_${nextRound.roundId}`,
          matchId,
          round: nextRound,
        });
        console.info(`[GameEngine] Round ${nextRound.number} created for match ${matchId}`);
      }

      return false; // more rounds pending
    } catch (e) {
      console.error('[GameEngine] Error in _handleRoundFinish:', e.message);
      return true; // treat as match finished on error
    }
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
      await EventStore.cleanupMatch(matchId);
      MatchManager.removeActor(matchId);
    } catch (e) {
      console.error('[GameEngine] Failed to archive match:', e.message);
    }
  }

  function _notifySessionExpired(ns, matchId, state) {
    const matchPlayers = state.metadata?.players || state.players || [];
    for (const p of matchPlayers) {
      const pid = p?.userId || p?.id;
      if (pid && !String(pid).startsWith('bot_')) {
        getAccountNs()?.to(`user:${pid}`).emit('SESSION_EXPIRED', { matchId });
      }
    }
  }

  async function _loadEngineLimits(gameSlug) {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM game_engine_limits gl
         JOIN game g ON g.id = gl.game_id
         WHERE g.slug = $1`,
        [gameSlug]
      );
      return rows[0] || {};
    } catch (e) {
      return {};
    }
  }
};

module.exports = { setupGameSocket };
