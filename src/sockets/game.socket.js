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
};

// Reconnect grace window (ms)
const RECONNECT_TIMEOUT_MS = 60 * 1000;
// Turn timeout (ms) for turn-based games
const TURN_TIMEOUT_MS = 60 * 1000;
// Minimum gap between chat messages from one user (ms) — light anti-spam
const CHAT_THROTTLE_MS = 400;
// Max chat message length (chars)
const CHAT_MAX_LEN = 200;
// Snake-ladder: idle players are auto-rolled (dice + move) instead of skipping
// their turn. 12s gives the client's visible 5s idle-grace + 5s countdown a
// 2s buffer before the server forces the roll itself.
const SNAKE_LADDER_TURN_TIMEOUT_MS = 12 * 1000;

const setupGameSocket = (io) => {
  const gameNs = io.of('/game-engine');
  const chatThrottle = new Map(); // userId → lastChatTs

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
        // The player may have returned right as this timer fired — only resolve
        // if they are still listed as offline.
        if (!(latestState.disconnectedPlayers || []).includes(userId)) return;
        await _resolveReconnectTimeout(gameNs, matchId, gameSlug, userId, latestState);
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
          // Snake-ladder: an idle player gets auto-rolled (dice + move) rather
          // than silently skipping the turn — keeps the match flowing. The
          // plugin rolls server-side, applies snakes/ladders and advances the
          // turn, exactly like a real ROLL move.
          if (gameSlug === 'snake-ladder') {
            const GameRegistry = require('../modules/game/engine/GameRegistry');
            const plugin = GameRegistry.createInstance(gameSlug, latestState.metadata);
            latestState.pluginState = plugin.applyMove(
              currentPlayerId,
              { type: 'ROLL' },
              latestState.pluginState,
            );
            if (plugin.isFinished(latestState.pluginState)) {
              latestState.status = MATCH_STATES.FINISHED;
              TimerEngine.clearAllTimers(matchId);
              await EventStore.saveMatchSnapshot(matchId, latestState);
              gameNs.to(`match:${matchId}`).emit(EVENTS.GAME_OVER, {
                state: latestState,
                winner: latestState.pluginState?.winner || null,
                reason: 'timeout',
              });
              botHandler.handleMatchEnd(matchId, gameSlug, latestState);
              await _archiveMatch(matchId, latestState);
              const players = latestState.metadata?.players || [];
              players.forEach(p => {
                io.to(`user:${p.userId}`).emit('SESSION_EXPIRED', { matchId });
              });
              return;
            }
          } else {
            latestState.pluginState = {
              ...latestState.pluginState,
              currentTurnIndex:
                ((latestState.pluginState.currentTurnIndex || 0) + 1) %
                (latestState.pluginState.turnOrder?.length || 1),
            };
          }
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
        `SELECT mm.user_id, mm.ws_token, mm.player_color, g.slug as game_slug, gm.metadata as match_metadata
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

      // AUTO/CUSTOM lobbies fill empty spots with bots stored in game_lobby.settings.bots.
      // Load them so the engine runs the bot as a real player and the match flows completely.
      socket.lobbyBots = [];
      try {
        const lobbyRes = await pool.query(
          `SELECT settings FROM game_lobby WHERE id = $1`,
          [matchId]
        );
        const settings = lobbyRes.rows[0]?.settings || {};
        if (Array.isArray(settings.bots)) socket.lobbyBots = settings.bots;
      } catch (e) { /* matchId may not be a lobby id (tournament/direct match) */ }

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
      // Inject lobby bots (AUTO/CUSTOM flow) so the engine includes them as players
      botHandler.setupBotPlayer(socket, players);
      // Keep the enriched list on the socket so READY detects bot matches correctly
      socket.matchPlayers = players;

      const result = await MatchManager.loadOrInitializeMatch(matchId, gameSlug, {
        players,
        maxPlayers: players.length || 2,
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
          // Window expired — resolve via the size-aware path (2p forfeit with
          // real winner id, 3+ removal, or everyone-offline draw).
          await _resolveReconnectTimeout(gameNs, matchId, gameSlug, userId, state);
          return socket.disconnect();
        } else {
          // Player returned within the reconnect window: mark them back.
          state.disconnectedPlayers = (state.disconnectedPlayers || []).filter(id => id !== userId);
          // Only resume once EVERY real player is back online. If others are
          // still away, keep the match paused and refresh the offline banner.
          const realPlayerIds = (state.players || state.metadata?.players || [])
            .filter(p => !p.isBot && !String(p.userId || p.id || '').startsWith('bot_'))
            .map(p => p.userId || p.id);
          const stillOffline = (state.disconnectedPlayers || []).filter(id => realPlayerIds.includes(id));

          if (stillOffline.length === 0) {
            state.status = MATCH_STATES.ACTIVE;
            state.pausedAt = null;
            await EventStore.saveMatchSnapshot(matchId, state);
            gameNs.to(matchRoom).emit(EVENTS.RESUME, { userId });
            botHandler.handleResume(matchId, gameSlug, state);
            _startTurnTimer(gameNs, matchId, gameSlug, state);
          } else {
            state.pausedAt = state.pausedAt || Date.now();
            await EventStore.saveMatchSnapshot(matchId, state);
            gameNs.to(matchRoom).emit(EVENTS.PAUSE, {
              reason: 'player_disconnected',
              userId: stillOffline[0],
              reconnectWindowMs: activeReconnectTimeout,
              disconnectedPlayers: stillOffline,
            });
          }
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

    // ── CHAT ────────────────────────────────────────────────────────────
    // Lightweight in-match chat: sanitize, throttle, then broadcast to every
    // player in the match room (including the sender) so all clients stay in
    // sync. No persistence — it's ephemeral game chat.
    socket.on(EVENTS.CHAT, (chatData) => {
      try {
        const text = String(chatData?.text || '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LEN);
        if (!text) return;

        // Per-user anti-spam throttle
        const now = Date.now();
        const last = chatThrottle.get(userId) || 0;
        if (now - last < CHAT_THROTTLE_MS) return;
        chatThrottle.set(userId, now);

        // Resolve sender identity from the match roster (falls back to payload)
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
        // Chat must never break the match flow
        socket.emit(EVENTS.ERROR, { message: 'Chat failed' });
      }
    });

    // ── READY ───────────────────────────────────────────────────────────
    socket.on(EVENTS.READY, async () => {
      try {
        let snap = await EventStore.loadMatchSnapshot(matchId);
        if (!snap) snap = state;

        if (!snap.readyPlayers) snap.readyPlayers = [];
        if (!snap.readyPlayers.includes(userId)) snap.readyPlayers.push(userId);

        // BOT MATCH: lobby bots don't send READY — only real players count.
        // Solo matches (1 real player + N bots) start on that player's READY; multi-human matches
        // wait for every real player so nobody misses the start.
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
          await EventStore.saveMatchSnapshot(matchId, snap);
          await EventStore.appendEvent(matchId, { type: 'GAME_START' });

          // Send player-specific start state
          const sockets = await gameNs.in(matchRoom).fetchSockets();
          for (const s of sockets) {
            const playerState = _getPlayerState(gameSlug, snap, s.userId);
            s.emit(EVENTS.START, { state: playerState, startedAt: snap.startedAt });
          }

          console.info(`[GameEngine] Match ${matchId} started — isBotMatch=${isBotMatch}`);

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

          // The normal (move-driven) finish path never told the clients their
          // session was over, so a stale "REJOIN MATCH" button could stick on
          // the Games screen forever. Broadcast SESSION_EXPIRED to every player
          // so the app clears the reconnect banner.
          const matchPlayers = updatedState.metadata?.players || updatedState.players || [];
          for (const p of matchPlayers) {
            const pid = p?.userId || p?.id;
            if (pid) io.to(`user:${pid}`).emit('SESSION_EXPIRED', { matchId });
          }
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
          // Round-based games (word-rush / scribble) run on a fixed-length round
          // clock that the round timer drives at round boundaries — a move must
          // never reset it (that used to extend rounds forever and never fire
          // GAME_OVER), so don't restart any timer on the move path for them.
          if (gameSlug !== 'scribble' && gameSlug !== 'word-rush') {
            _startTurnTimer(gameNs, matchId, gameSlug, updatedState);
          }
          
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
    const activeReconnectTimeout = RECONNECT_TIMEOUT_MS;

    // If the user has another live socket in this match (e.g. a second device
    // or a reconnect that landed before the old socket dropped), do NOT pause
    // the match — they are still connected.
    try {
      const liveSockets = await ns.in(matchRoom).fetchSockets();
      const hasOtherSocket = liveSockets.some(s => (s.data?.userId || s.userId) === userId);
      if (hasOtherSocket) return;
    } catch (e) { /* fall through — proceed with pause */ }

    const state = await EventStore.loadMatchSnapshot(matchId);
    if (!state) return;

    if (state.status === MATCH_STATES.ACTIVE) {
      // Track who is offline so multi-player matches can resume only when
      // every real player is back (and so we can draw when everyone is gone).
      state.disconnectedPlayers = [...new Set([...(state.disconnectedPlayers || []), userId])];
      if (state.readyPlayers) {
        state.readyPlayers = state.readyPlayers.filter(id => id !== userId);
      }
      state.status = MATCH_STATES.PAUSED;
      state.pausedAt = Date.now();
      await EventStore.saveMatchSnapshot(matchId, state);
      ns.to(matchRoom).emit(EVENTS.PAUSE, {
        reason: 'player_disconnected',
        userId,
        reconnectWindowMs: activeReconnectTimeout,
        disconnectedPlayers: state.disconnectedPlayers,
      });
      botHandler.handlePause(matchId, gameSlug, state);
    } else if (state.status === MATCH_STATES.WAITING) {
      // Match hasn't started yet — just drop them from the ready gate. The
      // waiting-for-players screen keeps everyone informed; no need to pause
      // a match that never started (that would skip the ready gate on return).
      state.disconnectedPlayers = [...new Set([...(state.disconnectedPlayers || []), userId])];
      if (state.readyPlayers) {
        state.readyPlayers = state.readyPlayers.filter(id => id !== userId);
      }
      await EventStore.saveMatchSnapshot(matchId, state);
      ns.to(matchRoom).emit(EVENTS.STATE, { state });
    }

    // Set reconnect timeout — forfeit / remove / draw if the player doesn't return
    await TimerEngine.startTimer(matchId, `reconnect:${userId}`, activeReconnectTimeout, {
      type: 'reconnect',
      userId,
      gameSlug,
    });
  }

  // ── Reconnect-timeout resolution (size-aware) ─────────────────────────────
  // Called when a real player's 60s reconnect window expires.
  //   • Everyone offline            → the match is a DRAW for all real players.
  //   • 2-player match              → the OTHER player wins (real winner id).
  //   • Solo-vs-bots match          → the human forfeits (bots win).
  //   • 3+ player match             → the offline player is removed and the
  //     match continues, skipping their turns; resumes once every remaining
  //     real player is back online.
  async function _resolveReconnectTimeout(ns, matchId, gameSlug, userId, state) {
    if (!state || state.status !== MATCH_STATES.PAUSED) return;

    const players = state.players || state.metadata?.players || [];
    const realPlayers = players.filter(p => !String(p.userId || p.id || '').startsWith('bot_'));
    const realIds = realPlayers.map(p => p.userId || p.id);
    const offline = state.disconnectedPlayers || [];

    // Everyone offline (only meaningful with 2+ real players) → DRAW
    const everyoneOffline = realIds.length >= 2 && realIds.every(id => offline.includes(id));
    if (everyoneOffline) {
      state.status = MATCH_STATES.FINISHED;
      state.winner = null;
      state.pausedAt = null;
      if (state.pluginState) {
        state.pluginState.status = 'finished';
        state.pluginState.winner = null;
        state.pluginState.drawReason = 'all_offline';
      }
      await EventStore.saveMatchSnapshot(matchId, state);
      await EventStore.appendEvent(matchId, { type: 'DRAW', reason: 'all_offline' });
      gameNs.to(`match:${matchId}`).emit(EVENTS.GAME_OVER, { state, reason: 'draw' });
      botHandler.handleMatchEnd(matchId, gameSlug, state);
      await _archiveMatch(matchId, state);
      for (const rid of realIds) {
        await _resolvePlayerSession({ matchId, userId: rid, result: 'DRAW', score: 0 });
      }
      for (const p of realPlayers) {
        io.to(`user:${p.userId || p.id}`).emit('SESSION_EXPIRED', { matchId });
      }
      return;
    }

    // 2-player match → the other real player is the winner (real winner id)
    if (realIds.length === 2) {
      const otherId = realIds.find(id => id !== userId) || null;
      state.status = MATCH_STATES.FINISHED;
      state.winner = otherId;
      state.pausedAt = null;
      if (state.pluginState) {
        state.pluginState.status = 'finished';
        state.pluginState.winner = otherId;
        state.pluginState.drawReason = 'forfeit';
      }
      await EventStore.saveMatchSnapshot(matchId, state);
      await EventStore.appendEvent(matchId, { type: 'FORFEIT', userId, winner: otherId });
      gameNs.to(`match:${matchId}`).emit(EVENTS.GAME_OVER, {
        state,
        reason: 'forfeit',
        winner: otherId,
        forfeitedBy: userId,
      });
      botHandler.handleMatchEnd(matchId, gameSlug, state);
      await _archiveMatch(matchId, state);
      await _resolvePlayerSession({ matchId, userId, result: 'LOSS', score: 0 });
      for (const p of realPlayers) {
        io.to(`user:${p.userId || p.id}`).emit('SESSION_EXPIRED', { matchId });
      }
      return;
    }

    // Solo-vs-bots match → the human forfeits (bots win)
    if (realIds.length === 1) {
      const bot = players.find(p => String(p.userId || p.id || '').startsWith('bot_'));
      const winnerId = bot ? (bot.userId || bot.id) : null;
      state.status = MATCH_STATES.FINISHED;
      state.winner = winnerId;
      state.pausedAt = null;
      if (state.pluginState) {
        state.pluginState.status = 'finished';
        state.pluginState.winner = winnerId;
        state.pluginState.drawReason = 'forfeit';
      }
      await EventStore.saveMatchSnapshot(matchId, state);
      await EventStore.appendEvent(matchId, { type: 'FORFEIT', userId, winner: winnerId });
      gameNs.to(`match:${matchId}`).emit(EVENTS.GAME_OVER, {
        state,
        reason: 'forfeit',
        winner: winnerId,
        forfeitedBy: userId,
      });
      botHandler.handleMatchEnd(matchId, gameSlug, state);
      await _archiveMatch(matchId, state);
      await _resolvePlayerSession({ matchId, userId, result: 'LOSS', score: 0 });
      io.to(`user:${userId}`).emit('SESSION_EXPIRED', { matchId });
      return;
    }

    // 3+ players → remove the offline player and continue, skipping their turns
    state.disconnectedPlayers = offline.filter(id => id !== userId);
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
            // The removed player sat BEFORE the current turn holder, so the
            // whole order shifted left — move the turn index back by one.
            state.pluginState.currentTurnIndex -= 1;
          } else if (idx === state.pluginState.currentTurnIndex) {
            // The removed player held the current turn — keep the same index
            // (it now points at the next player in line), wrapping modulo len.
            state.pluginState.currentTurnIndex =
              state.pluginState.currentTurnIndex % len;
          }
        }
      }
      if (state.pluginState.scores) delete state.pluginState.scores[userId];
    }
    await EventStore.saveMatchSnapshot(matchId, state);
    await EventStore.appendEvent(matchId, { type: 'PLAYER_REMOVED', userId });
    await _resolvePlayerSession({ matchId, userId, result: 'LOSS', score: 0 });
    io.to(`user:${userId}`).emit('SESSION_EXPIRED', { matchId });

    // Resume only when every remaining real player is back online
    const remainingReal = (state.players || state.metadata?.players || [])
      .filter(p => !String(p.userId || p.id || '').startsWith('bot_'))
      .map(p => p.userId || p.id);
    const stillOffline = (state.disconnectedPlayers || []).filter(id => remainingReal.includes(id));
    if (stillOffline.length === 0) {
      state.status = MATCH_STATES.ACTIVE;
      state.pausedAt = null;
      await EventStore.saveMatchSnapshot(matchId, state);
      // Tell every remaining client to drop the removed player from the board
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
      // Others still offline — keep paused and refresh the offline banner
      ns.to(`match:${matchId}`).emit(EVENTS.PAUSE, {
        reason: 'player_disconnected',
        userId: stillOffline[0],
        reconnectWindowMs: RECONNECT_TIMEOUT_MS,
        disconnectedPlayers: stillOffline,
      });
    }
  }

  // ── Server-side session resolution ────────────────────────────────────────
  // Resolves a player's game_session + match history when no client will call
  // completeGameSession (forfeit / draw / player removed by reconnect timeout).
  async function _resolvePlayerSession({ matchId, userId, result, score = 0 }) {
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
        xpEarned: 0,
        matchGroupId: matchId,
      });
    } catch (e) {
      console.error(`[GameEngine] Failed to resolve session for ${userId} in ${matchId}:`, e.message);
    }
  }

  async function _startTurnTimer(ns, matchId, gameSlug, state) {
    try {
      const turnBasedSlugs = ['chess', 'ludo', 'snake-ladder'];
      if (turnBasedSlugs.includes(gameSlug)) {
        const currentPlayerId =
          state.pluginState?.turnOrder?.[state.pluginState?.currentTurnIndex];
        if (!currentPlayerId) return;

      // Only replace the turn clock. Clearing ALL timers here used to wipe a
      // disconnected player's pending reconnect timer on every move/resume,
      // cancelling their forfeit window. Round timers never exist for these
      // games, so clearing just the turn timer is correct.
      await TimerEngine.clearTimer(matchId, 'turn');

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
      } else if (gameSlug === 'snake-ladder') {
        // Idle players get auto-rolled shortly after the client countdown ends.
        timerDuration = SNAKE_LADDER_TURN_TIMEOUT_MS;
      }

      await TimerEngine.startTimer(matchId, 'turn', timerDuration, {
        type: 'turn',
        gameSlug,
      });
    } else if (gameSlug === 'scribble' || gameSlug === 'word-rush') {
      // Round-based games: drive bots and (re)start the round clock. The round
      // timer is fixed-length and only (re)started at match start, resume and
      // round boundaries — the move path (MOVE handler / bot moves) skips this
      // function entirely so a move can never extend the round.
      const ROUND_TIMEOUT_MS = gameSlug === 'scribble' ? 80000 : 90000;
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
