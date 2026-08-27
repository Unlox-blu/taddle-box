const cron = require('node-cron');

function startScheduler(config, backupService, logger, options = {}) {
  const task = cron.schedule(config.schedule, () => { void backupService.runBackup({ signal: options.signal }); }, { timezone: config.timezone });
  logger.info('Backup scheduler started');
  logger.info('Next backup scheduled', { schedule: config.schedule, timezone: config.timezone });
  return task;
}

module.exports = { startScheduler };
