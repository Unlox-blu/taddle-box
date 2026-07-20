'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/app.config');
const { createError } = require('./error.util');

const generateAccessToken = (payload) =>
  jwt.sign(payload, config.TOKEN_SECRET, { expiresIn: config.ACCESS_TOKEN_EXPIRES_IN });

const generateRefreshToken = (payload) =>
  jwt.sign(payload, config.TOKEN_SECRET, { expiresIn: config.REFRESH_TOKEN_EXPIRES_IN });

const generateVerificationToken = (payload) =>
  jwt.sign(payload, config.TOKEN_SECRET, { expiresIn: config.VERIFICATION_TOKEN_EXPIRES_IN });

const generateSocialToken = (payload) =>
  jwt.sign(payload, config.TOKEN_SECRET, { expiresIn: '30m' });



const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, config.TOKEN_SECRET);
  } catch {
    throw createError('Invalid or expired access token', 401);
  }
};

const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, config.TOKEN_SECRET);
  } catch {
    throw createError('Invalid or expired refresh token', 401);
  }
};

const verifyVerificationToken = (token) => {
  try {
    return jwt.verify(token, config.TOKEN_SECRET);
  } catch {
    throw createError('Invalid or expired verification token', 401);
  }
};

const verifySocialToken = (token) => {
  try {
    return jwt.verify(token, config.TOKEN_SECRET);
  } catch {
    throw createError('Invalid or expired social token', 401);
  }
};

//Generates a cryptographically secure random token
const generateRandomToken = () => crypto.randomBytes(32).toString('hex');

//SHA-256 hash of a token — used to store in DB without exposing raw value 
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateVerificationToken,
  generateSocialToken,
  verifyAccessToken,
  verifyRefreshToken,
  verifyVerificationToken,
  verifySocialToken,
  generateRandomToken,
  hashToken,
};
