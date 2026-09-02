'use strict';

const feedSessionRepository = require('./feed.session.repository');
const FeedSessionService = require('./feed.session.service');
const FeedSessionController = require('./feed.session.controller');

const feedRepository = require('../feed/feed.repository');
const { feedService } = require('../feed/feed.container');

const feedSessionService = new FeedSessionService({
  feedRepository,
  feedService,
});

const feedSessionController = new FeedSessionController({
  feedSessionService,
});

module.exports = { feedSessionController, feedSessionService };
