'use strict';

const { verifyVerificationToken } = require('../utils/token.util');
const { createError } = require('../utils/error.util');

const verifyOtpToken = (req, _res, next) => {
  try {
    let token = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.verification_token) {
      token = req.cookies.verification_token;
    }

    if (!token) throw createError('Verification required', 401);

    const payload = verifyVerificationToken(token);
    
    req.email = payload.email;
    req.countryCode = payload.countryCode
    req.phone = payload.phone
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { verifyOtpToken };
