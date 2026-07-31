'use strict';

const { Server } = require('socket.io');
const config = require('../config/app.config');
const { socketAuthMiddleware } = require('./middleware/socket.auth');
const { setupNotificationSocket } = require('./notification.socket');
const { setupActiveStatus } = require('./status.socket');
const { setupGameSocket } = require('./game.socket');
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

  io.on('connection', (socket) => {
    // Join personal room for targeted notifications
    socket.join(`user:${socket.userId}`);
    console.info(`[Socket] Connected: ${socket.userId} (${socket.id})`);

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
  _io = io;
  return io;
};

// Returns the Socket.io instance for use in controllers/workers
const getIO = () => {
  if (!_io) throw new Error('Socket.io not initialized');
  return _io;
};

module.exports = { initializeSockets, getIO };
