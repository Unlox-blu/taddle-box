'use strict';

const crypto = require('crypto');
const pool = require('../config/database');

const setupGameSocket = (io) => {
  const gameNamespace = io.of('/game-sync');

  gameNamespace.use(async (socket, next) => {
    const { sessionId, wsToken } = socket.handshake.auth;
    if (!sessionId || !wsToken) return next(new Error('Authentication error'));
    
    try {
      const { rows } = await pool.query('SELECT * FROM game_sessions WHERE id = $1', [sessionId]);
      const session = rows[0];
      if (!session) return next(new Error('Session not found'));
      if (session.status !== 'ACTIVE') return next(new Error('Session not active'));
      
      socket.session = session;
      next();
    } catch (e) {
      next(new Error('Database error'));
    }
  });

  gameNamespace.on('connection', (socket) => {
    console.info(`[Game Socket] Connected: ${socket.id} to session ${socket.session.id}`);

    let sequenceNumber = 0;
    
    const generateChunk = () => {
      const hash = crypto.createHmac('sha256', socket.session.seed)
                         .update(sequenceNumber.toString())
                         .digest('hex');
      
      const chunk = {
        seq: sequenceNumber,
        targets: [
          { x: parseInt(hash.slice(0, 2), 16) % 100, y: parseInt(hash.slice(2, 4), 16) % 100, delay: parseInt(hash.slice(4, 6), 16) % 1000 },
          { x: parseInt(hash.slice(6, 8), 16) % 100, y: parseInt(hash.slice(8, 10), 16) % 100, delay: parseInt(hash.slice(10, 12), 16) % 1000 }
        ]
      };
      
      const signature = crypto.createHmac('sha256', socket.session.seed)
                              .update(JSON.stringify(chunk))
                              .digest('hex');
      
      sequenceNumber++;
      return { payload: chunk, signature };
    };

    const intervalId = setInterval(() => {
      if (sequenceNumber >= 15) {
        clearInterval(intervalId);
        socket.emit('game_end', { reason: 'timeout' });
        return;
      }
      socket.emit('chunk', generateChunk());
    }, 2000);

    socket.on('disconnect', () => {
      console.info(`[Game Socket] Disconnected: ${socket.id}`);
      clearInterval(intervalId);
    });
  });
};

module.exports = { setupGameSocket };
