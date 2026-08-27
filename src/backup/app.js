const { loadConfig } = require('./config/config');
const { checkPgDump } = require('./backup/backup.executor');
const { createBackupService } = require('./backup/backup.service');
const { startScheduler } = require('./scheduler/backup.scheduler');
const {logger} = require('../middlewares/logger.middleware');

function getLocalDateParts(date, timezone) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, Number(value)]));
}

function shouldRunImmediately(backup, schedule, timezone, now = new Date()) {
  if (!backup) return true;
  const current = getLocalDateParts(now, timezone);
  const created = getLocalDateParts(backup.createdAt || backup.modifiedAt, timezone);
  if (created.year === current.year && created.month === current.month && created.day === current.day) return false;
  const fields = schedule.trim().split(/\s+/);
  const scheduledHour = Number(fields[1]);
  const scheduledMinute = Number(fields[0]);
  return fields.length >= 5 && Number.isInteger(scheduledHour) && Number.isInteger(scheduledMinute)
    && (current.hour > scheduledHour || (current.hour === scheduledHour && current.minute >= scheduledMinute));
}

async function startBackUp() {
  const config = loadConfig();
  await checkPgDump();
  const backupService = createBackupService(config);
  const controller = new AbortController();
  const existingBackup = await backupService.getLatestBackup();
  if (shouldRunImmediately(existingBackup, config.schedule, config.timezone)) {
    logger.info(existingBackup ? 'Previous backup is overdue; creating an immediate backup' : 'No valid backup found; creating an immediate backup');
    const result = await backupService.runBackup({ signal: controller.signal });
    if (result.success === false) throw new Error('Initial backup failed');
  } else {
    logger.info('Existing valid backup found; scheduling next backup');
  }
  const scheduler = startScheduler(config, backupService, logger, { signal: controller.signal });
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutting down', { signal });
    scheduler.stop();
    controller.abort();
    process.exitCode = 0;
  };
  process.once('SIGINT', () => { void shutdown('SIGINT'); });
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
  return { scheduler, shutdown };
}

if (require.main === module) {
  startBackUp().catch((error) => {
    logger.error('Application failed to startBackUp', { error: error.message });
    process.exitCode = 1;
  });
}

module.exports = { startBackUp, shouldRunImmediately };
