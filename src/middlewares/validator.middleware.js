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
    
    if (key === 'body') console.log("VALIDATING BODY:", req[key]);

    const result = schema.safeParse(req[key]);

    if (!result.success) {
      const errors = result.error.errors.map((e) =>{ 
        return ({
        field: [key, ...e.path].join('.'), 
        message: e.message,
      })});

      const detailedMessage = errors.map(e => `${e.field}: ${e.message}`).join(', ');
      const err = createError(detailedMessage, 400);
      err.errors = errors;
      return next(err);
    }
    Object.assign(req[key], result.data);
  }
  next();
  } catch (error) {
    next(error)
  }
};

module.exports = { validateRequest };
