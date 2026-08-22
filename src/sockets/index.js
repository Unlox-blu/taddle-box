'use strict';

const { Server } = require('socket.io');
const config = require('../config/app.config');
const { decodeToken } = require('../utils/token.util');
const { setupDeviceSocket } = require('./device.socket');
const { setupAccountSocket } = require('./account.socket');
const { setupChatSocket } = require('./chat.socket');
const { setupGameSocket } = require('./game.socket');
const { createAdapter } = require('@socket.io/redis-adapter');
const redisClient = require('../config/redis');

let _io = null;

// ── Namespace registry ─────────────────────────────────────────────────────
// Cross-namespace emit helpers (e.g. emitSessionRevoked) need a reference
// to namespaces they don't own. Each setup* function registers its namespace
// here so any module can look it up at emit time.
const namespaces = {};

const getNamespace = (name) => namespaces[name] || null;

// ── Auth middlewares ────────────────────────────────────────────────────────
// Device: deviceId only (no JWT)
const deviceAuth = (socket, next) => {
  const deviceId = socket.handshake.auth?.deviceId;
  if (!deviceId) return next(new Error('deviceId required'));
  socket.deviceId = deviceId;
  next();
};

// Account: JWT only (no deviceId)
const accountAuth = (socket, next) => {
  try {
    const token = socket.handshake.auth?.token
      || socket.handshake.headers?.cookie?.split(';').reduce((acc, c) => {
          const [k, v] = c.trim().split('=');
          if (k === 'access_token') acc = v;
          return acc;
        }, null);
    if (!token) return next(new Error('Authentication required'));
    const payload = decodeToken(token);
    socket.userId = payload.userId;
    socket.userRole = payload.role;
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
};

// Chat: JWT only (same as account, but separate namespace for lifecycle)
const chatAuth = accountAuth;

// ── Initialize all namespaces ───────────────────────────────────────────────
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

  // ── /device-socket ─────────────────────────────────────────────────────
  // Device-level: authenticated by deviceId (from SecureStore).
  // Always connected from app mount, before any user logs in.
  // Receives: auth:session_revoked
  const deviceNs = io.of('/device-socket');
  deviceNs.use(deviceAuth);
  namespaces['device'] = deviceNs;
  setupDeviceSocket(deviceNs);

  // ── /account-socket ────────────────────────────────────────────────────
  // Account-level: authenticated by JWT.
  // Connected while any user is logged in.
  // Handles: notifications, wallet, XP, leaderboards, follow events,
  //          active status, heartbeat
  const accountNs = io.of('/account-socket');
  accountNs.use(accountAuth);
  namespaces['account'] = accountNs;
  setupAccountSocket(accountNs);

  // ── /chat-socket ───────────────────────────────────────────────────────
  // Account-level: authenticated by JWT.
  // Connected only when chat is open, disconnected when chat closes.
  // Handles: messages, reactions, typing indicators
  const chatNs = io.of('/chat-socket');
  chatNs.use(chatAuth);
  namespaces['chat'] = chatNs;
  setupChatSocket(chatNs);

  // ── /game-socket (was /game-engine) ────────────────────────────────────
  // Game-level: JWT + matchId + game session token.
  // Connected only during active game.
  // Handles: matchmaking, game state, in-game chat
  namespaces['game'] = io.of('/game-socket');
  setupGameSocket(io, namespaces['game']);

  _io = io;
  return io;
};

const getIO = () => {
  if (!_io) throw new Error('Socket.io not initialized');
  return _io;
};

module.exports = { initializeSockets, getIO, getNamespace };
