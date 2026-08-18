'use strict';

/**
 * Public app-asset routes — index-style aggregator, mirroring routes/index.js
 * but deliberately mounted OUTSIDE /api/v1 (see app.js) so static app assets
 * stay auth-free and are served THROUGH the backend instead of the client
 * hitting S3 (or a third-party host) directly.
 *
 * Single mount: /app-assets (app.js). Sub-paths mirror the S3 keys 1:1 —
 * game content under /games/... (logos, sounds, cards), app branding under
 * /lottie/... Add new asset routes here to keep every asset route
 * discoverable in one place.
 */
const router = require('express').Router();

// The app-assets proxy: streams from S3 with long cache headers + ETag/304
// revalidation, disk fallback for dev. Lives with the game domain in
// src/modules/game/ (its game content dominates today).
router.use('/', require('../modules/game/gameassets.route'));

module.exports = router;
