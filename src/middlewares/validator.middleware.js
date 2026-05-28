'use strict';

const { createError } = require('../utils/error.util');

// Zod validation middleware factory
const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    const err = createError('Validation failed', 400);
    err.errors = errors;
    return next(err);
  }
  req.body = result.data;
  next();
};

module.exports = { validate };
