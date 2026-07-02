'use strict';

const { verifyAccessToken } = require('../../utils/token.util');


const socketAuthMiddleware = (socket, next) => {
  try {
    let token = null;

    
    if (socket.handshake.auth?.token) {
      token = socket.handshake.auth.token;
    } else if (socket.handshake.headers?.cookie) {
      // Option 2: Parse access_token from cookie header
      const cookies = socket.handshake.headers.cookie.split(';').reduce((acc, c) => {
        const [k, v] = c.trim().split('=');
        acc[k] = v;
        return acc;
      }, {});
      token = cookies['access_token'];
    }

    if (!token) return next(new Error('Authentication required'));

    const payload = verifyAccessToken(token);
    socket.userId = payload.userId;
    socket.userRole = payload.role;
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
};

module.exports = { socketAuthMiddleware };
