'use strict';

const express = require('express');
const fileUpload = require("express-fileupload");
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./config/app.config');
const { requestIdMiddleware } = require('./middlewares/request-id.middleware');
const { loggerMiddleware } = require('./middlewares/logger.middleware');
const { sanitizeMiddleware } = require('./utils/sanitize.util');
const { authRateLimiter, globalRateLimiter } = require('./middlewares/rate-limiter.middleware');
const { notFoundHandler, globalErrorHandler } = require('./utils/error.util');

const app = express();

// Request ID
app.use(requestIdMiddleware);

// Security headers
app.use(helmet({ contentSecurityPolicy: true, hsts: { maxAge: 31536000 } }));

// CORS
app.use(cors({ origin: config.ALLOWED_ORIGINS, credentials: true }));

// Passing fileUpload as a middleware
app.use(fileUpload( {useTempFiles: false}));

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Global rate limiter
// app.use(globalRateLimiter);

// Request logger
app.use(loggerMiddleware);

// Input sanitization
app.use(sanitizeMiddleware);

// Health check (no auth needed)
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Auth routes with strict rate limiter
// app.use('/api/v1/auth', authRateLimiter, require('./routes/index').authOnly);
app.use('/api/v1/auth', require('./routes/index').authOnly);

// All API routes
app.use('/api/v1', require('./routes'));

// Webhook routes
// app.use('/webhooks', require('./routes/webhook.route'));

// 404 + Global error handler
app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;
