'use strict';

// Import dependencies
const ReelSessionService = require('./reel.session.service');
const ReelSessionController = require('./reel.session.controller');

// Import feed dependencies (avoid circular requires)
const feedRepository = require('../feed/feed.repository');

// Instantiate Service
// Note: we no longer need feedService because the client provides seed posts.
// The service only needs feedRepository for any direct DB queries it may need.
const reelSessionService = new ReelSessionService({
  feedRepository,
});

// Instantiate Controller
const reelSessionController = new ReelSessionController({
  reelSessionService,
});

module.exports = { reelSessionController, reelSessionService };
