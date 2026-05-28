'use strict';

// Strips HTML tags and trims a string
const sanitizeString = (str) =>
  typeof str === 'string' ? str.replace(/<[^>]*>/g, '').trim() : str;

// Recursively sanitizes all string values in an object
const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k,
      typeof v === 'string' ? sanitizeString(v) : typeof v === 'object' ? sanitizeObject(v) : v,
    ])
  );
};

// Express middleware — sanitizes req.body, req.query, req.params
const sanitizeMiddleware = (req, _res, next) => {
  if (req.body) req.body = sanitizeObject(req.body);
  if (req.query) req.query = sanitizeObject(req.query);
  if (req.params) req.params = sanitizeObject(req.params);
  next();
};

module.exports = { sanitizeString, sanitizeObject, sanitizeMiddleware };
