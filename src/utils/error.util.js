'use strict';

class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Factory helper — usage: throw createError('Not found', 404)
const createError = (message, statusCode = 500) => new AppError(message, statusCode);

// Express 404 catch-all
const notFoundHandler = (req, res, next) => {
  next(createError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
};

// Express global error handler — must be last middleware
const globalErrorHandler = (err, req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // Don't log 4xx client errors verbosely
  if (statusCode >= 500) {
    console.error('SERVER ERROR', {
      requestId: req.requestId,
      message: err.message,
      stack: err.stack,
    });
  }

  res.status(statusCode).json({
    success: false,
    message: isProduction && statusCode === 500 ? 'Internal server error' : err.message,
    errors: err.errors || null,
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  });
};

module.exports = { AppError, createError, notFoundHandler, globalErrorHandler };
