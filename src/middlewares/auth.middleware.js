'use strict';

const { verifyAccessToken } = require('../utils/token.util');
const { createError } = require('../utils/error.util');

const verifyToken = (req, _res, next) => {
  try {
    let token = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.access_token) {
      token = req.cookies.access_token;
    }

    if (!token) throw createError('Authentication required', 401);

    const payload = verifyAccessToken(token);
    req.userId = payload.userId;
    req.userRole = payload.role;
    next();
  } catch (err) {
    next(err);
  }
};


const optionalAuth = (req, _res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.access_token) {
      token = req.cookies.access_token;
    }
    if (token) {
      const payload = verifyAccessToken(token);
      req.userId = payload.userId;
      req.userRole = payload.role;
    }
  } catch {
    // Ignore invalid tokens
  }
  next();
};

module.exports = { verifyToken, optionalAuth };
