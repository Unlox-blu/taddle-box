'use strict';

const pushRepository = require('./push.repository');
const PushService = require('./push.service');
const PushController = require('./push.controller');

const pushService = new PushService({ pushRepository });
const pushController = new PushController({ pushService });

module.exports = { pushController, pushService, pushRepository };
