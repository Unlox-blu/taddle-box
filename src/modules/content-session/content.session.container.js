'use strict';

const contentSessionRepository = require('./content.session.repository');
const ContentSessionService = require('./content.session.service');
const ContentSessionController = require('./content.session.controller');

const feedRepository = require('../feed/feed.repository');
const { feedService } = require('../feed/feed.container');

const contentSessionService = new ContentSessionService({
  feedRepository,
  feedService,
});

const contentSessionController = new ContentSessionController({
  contentSessionService,
});

module.exports = { contentSessionController, contentSessionService };
