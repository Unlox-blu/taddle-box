'use strict';

const { Server } = require('socket.io');
const config = require('../config/app.config');
const { socketAuthMiddleware } = require('./middleware/socket.auth');
const { setupNotificationSocket } = require('./notification.socket');
const { setupActiveStatus } = require('./status.socket');
const { setupGameSocket } = require('./game.socket');
const { setupDeviceSocket } = require('./device.socket');
const { createAdapter } = require('@socket.io/redis-adapter');
const redisClient = require('../config/redis');

let _io = null;

const initializeSockets = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: config.ALLOWED_ORIGINS,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  const pubClient = redisClient.duplicate();
  const subClient = redisClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  // Auth middleware — runs before every connection
  io.use(socketAuthMiddleware);

  // Best-effort: re-send the user's live matchmaking state so the queue
  // screen restores instantly after a socket (re)connect — the client treats
  // matchmaking:lobbyUpdated / matchmaking:matched as the live channel and only
  // falls back to polling when this event stream is silent. Never blocks the
  // handshake, and any failure (expired lobby, DB hiccup) is absorbed here.
  const replayActiveLobby = (socket) => {
    setTimeout(async () => {
      try {
        const gameRepo = require('../modules/game/game.repository');
        // 1) A match created while offline starts instantly — replay the
        //    MATCHED payload exactly as the live channel would have emitted it.
        const matched = await gameRepo.findActiveMatchedMatch({ userId: socket.userId });
        if (matched) {
          io.to(`user:${socket.userId}`).emit('matchmaking:matched', matched);
          return;
        }
        // 2) Still queued — replay the lobby state so the player list restores.
        //    Tournament tickets ride the same WAITING path (long-TTL lobby, real
        //    players only), so a mid-queue drop in a tournament restores exactly
        //    like an AUTO queue — with the tournamentId attached so the client
        //    knows which tournament the restored queue belongs to.
        const queued = await gameRepo.findActiveQueuedLobby({ userId: socket.userId });
        if (!queued?.lobbyId) return;
        const lobby = await gameRepo.getLobby({ userId: socket.userId, lobbyId: queued.lobbyId });
        if (lobby) {
          io.to(`user:${socket.userId}`).emit('matchmaking:lobbyUpdated', {
            ...lobby,
            mode: queued.mode,
            tournamentId: queued.tournamentId,
          });
        }
      } catch (e) {
        // Lobby not found / expired / DB hiccup — the client's backoff poll
        // covers any gap.
      }
    }, 250);
  };

  io.on('connection', (socket) => {
    // Join personal room for targeted notifications
    socket.join(`user:${socket.userId}`);
    console.info(`[Socket] Connected: ${socket.userId} (${socket.id})`);

    // Re-deliver the active lobby state after any (re)connect.
    replayActiveLobby(socket);

    socket.on('disconnect', (reason) => {
      console.info(`[Socket] Disconnected: ${socket.userId} — ${reason}`);
    });

    socket.on('error', (err) => {
      console.error(`[Socket] Error from ${socket.userId}:`, err.message);
    });
  });

  // Register domain-specific socket handlers
  setupActiveStatus(io);
  setupNotificationSocket(io);
  setupGameSocket(io);
  setupDeviceSocket(io);
  _io = io;
  return io;
};

// Returns the Socket.io instance for use in controllers/workers
const getIO = () => {
  if (!_io) throw new Error('Socket.io not initialized');
  return _io;
};

module.exports = { initializeSockets, getIO };
