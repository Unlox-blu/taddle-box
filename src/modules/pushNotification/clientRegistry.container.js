'use strict';

const clientRegistryRepository = require('./clientRegistry.repository');
const ClientRegistryService = require('./clientRegistry.service');
const ClientRegistryController = require('./clientRegistry.controller');

const clientRegistryService = new ClientRegistryService({ clientRegistryRepository });
const clientRegistryController = new ClientRegistryController({ clientRegistryService });

module.exports = { clientRegistryController, clientRegistryService, clientRegistryRepository };
