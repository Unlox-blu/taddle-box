'use strict';

const { OAuth2Client } = require('google-auth-library');
const config = require('../../config/app.config');
const { createError } = require('../../utils/error.util');

const client = new OAuth2Client(config.GOOGLE_CLIENT_ID);

// Verifies a Google ID token from the frontend.
const verifyGoogleToken = async (idToken) => {
  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken,
      audience: config.GOOGLE_CLIENT_ID,
    });
  } catch {
    throw createError('Invalid Google token', 401);
  }

  const payload = ticket.getPayload();
  if (!payload) throw createError('Google token payload missing', 401);

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture || null,
    emailVerified: payload.email_verified || false,
  };
};

module.exports = { verifyGoogleToken };
