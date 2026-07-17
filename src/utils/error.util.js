'use strict';

const http = require('http');
const { logger } = require('../middlewares/logger.middleware');

class AppError extends Error {
  constructor(
    message,
    statusCode = 500,
    isOperational = true,
    details = null
  ) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Factory
 */
const createError = (
  message,
  statusCode = 500,
  details = null
) => new AppError(message, statusCode, true, details);

/**
 * 404 Handler
 */
const notFoundHandler = (req, res, next) => {
  next(
    createError(
      `Route not found: ${req.method} ${req.originalUrl}`,
      404
    )
  );
};

/**
 * Global Error Handler
 */
const globalErrorHandler = (err, req, res, _next) => {
  const statusCode = err.statusCode || err.status || 500;
  /**
   * Log everything
   */
  logger.logError(err, {
    component: 'HTTP',

    method: req.method,
    url: req.originalUrl,

    status: statusCode,

    requestId: req.requestId,

    userId: req.userId ?? res.locals.userId,

    ip: req.ip,
  });

  const errorStatus =
    http.STATUS_CODES[statusCode] || 'Unknown Error';

  const isProduction =
    process.env.NODE_ENV === 'production';

  const response = {
    success: false,

    statusCode,

    error: errorStatus,

    message:
      isProduction && statusCode >= 500
        ? 'Internal Server Error'
        : err.message || errorStatus,

    errors: err.details || err.errors || null,

    requestId: req.requestId,

    timestamp: new Date().toISOString(),
  };

  res.status(statusCode).json(response);
};

module.exports = {
  AppError,
  createError,
  notFoundHandler,
  globalErrorHandler,
};