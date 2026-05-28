'use strict';

const { createError } = require('../utils/error.util');

// authorize (Role-based access control factory. Usage: router.delete('/post/:id', verifyToken, authorize('admin','moderator'), controller.delete))
const authorize = (...roles) => (req, _res, next) => {
  if (!req.userRole || !roles.includes(req.userRole)) {
    return next(createError('You do not have permission to perform this action', 403));
  }
  next();
};

module.exports = { authorize };
