'use strict';

const express = require('express');
const fileUpload = require('express-fileupload');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./config/app.config');
const { requestIdMiddleware } = require('./middlewares/request-id.middleware');
const { loggerMiddleware } = require('./middlewares/logger.middleware');
const { sanitizeMiddleware } = require('./utils/sanitize.util');
const { authRateLimiter, globalRateLimiter, assetRateLimiter } = require('./middlewares/rate-limiter.middleware');
const { notFoundHandler, globalErrorHandler } = require('./utils/error.util');

const app = express();
app.set('trust proxy', 1);

// Request ID
app.use(requestIdMiddleware);

// Security headers
app.use(helmet({ contentSecurityPolicy: true, hsts: { maxAge: 31536000 } }));

// CORS
app.use(cors({ origin: config.ALLOWED_ORIGINS, credentials: true }));

// Passing fileUpload as a middleware
app.use(fileUpload({ useTempFiles: false }));

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

// Root landing page — pretty HTML status page for browsers, JSON for API
// clients that explicitly send `Accept: application/json`.
const { homeHandler } = require('./utils/home.util');
app.get('/', homeHandler);

// Public app-asset routes (aggregated in routes/appassets.route.js): the
// app's on-demand game downloads + mirrored third-party images (see
// taddlebox-app/src/games/gameAssets.ts). Single mount at /app-assets with
// sub-paths (e.g. /app-assets/games/logos/...). The client only ever talks
// to the backend — routes stream the objects from S3 (the origin, pushed by
// scripts/upload-game-assets.js and scripts/sync-third-party-images.js) with
// long cache headers + ETag/304 revalidation, falling back to the local disk
// folder (GAME_ASSETS_DIR) when S3 is unreachable. Rate-limited per IP so a
// scraper can't hammer the S3 proxy.
const appAssetsRouter = require('./routes/appassets.route');
app.use('/app-assets', assetRateLimiter, appAssetsRouter);

// Auth routes with strict rate limiter
// app.use('/api/v1/auth', authRateLimiter, require('./routes/index').authOnly);
app.use('/api/v1/auth', require('./routes/index').authOnly);

// All API routes
app.use('/api/v1', require('./routes/index'));

// Webhook routes
// app.use('/webhooks', require('./routes/webhook.route'));

// 404 + Global error handler
app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;
