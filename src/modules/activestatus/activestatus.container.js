// Repository
const activeStatusRepository = require('./activestatus.repository')

// Service
const ActiveStatusService = require('./activestatus.service')

// Controller
const ActiveStatusController = require('./activestatus.controller')

// Instantiate Service
const activeStatusService = new ActiveStatusService({activeStatusRepository})

// Instantiate Controller
const activeStatusController = new ActiveStatusController({activeStatusService})


module.exports = {activeStatusController, activeStatusService, activeStatusRepository}