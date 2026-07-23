'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/app.config');
const { createError } = require('./error.util');




const generateToken = (payload, expiresIn) =>
  jwt.sign(payload, config.TOKEN_SECRET, { expiresIn: expiresIn });

const decodeToken = (token) => {
  try {
    return jwt.verify(token, config.TOKEN_SECRET);
  } catch {
    throw createError('Invalid or expired token', 401);
  }
};

//Generates a cryptographically secure random token
const generateRandomToken = () => crypto.randomBytes(32).toString('hex');

//SHA-256 hash of a token — used to store in DB without exposing raw value 
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

module.exports = {
  generateToken,
  decodeToken,
  generateRandomToken,
  hashToken,
};
