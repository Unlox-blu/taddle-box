'use strict';

const { createError } = require('../utils/error.util');

// Universal validation middleware factory
const validateRequest = ({ body, query, params }) => (req, _res, next) => {
  try {
    if(!body && !query && !params)
      throw createError('Provide body or query or params to validate values', 500)

  const targets = { body, query, params };
  
  for (const [key, schema] of Object.entries(targets)) {
    if (!schema) continue; 

    const result = schema.safeParse(req[key]);

    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: [key, ...e.path].join('.'), 
        message: e.message,
      }));

      const err = createError('Validation failed', 400);
      err.errors = errors;
      return next(err);
    }

    req[key] = result.data;
  }
  next();
  } catch (error) {
    next(error)
  }
};

module.exports = { validateRequest };
