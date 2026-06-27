'use strict';

const { Server } = require('socket.io');
const config = require('../config/app.config');
const { socketAuthMiddleware } = require('./middleware/socket.auth');
const { setupNotificationSocket } = require('./notification.socket');
const { setupActiveStatus } = require('./status.socket');

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
  _io = io;
  return io;
};

// Returns the Socket.io instance for use in controllers/workers
const getIO = () => {
  if (!_io) throw new Error('Socket.io not initialized');
  return _io;
};

module.exports = { initializeSockets, getIO };
