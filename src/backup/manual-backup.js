require('dotenv').config();
const { loadConfig } = require('./config/config');
const { checkPgDump } = require('./backup/backup.executor');
const { createBackupService } = require('./backup/backup.service');
const logger = require('./utils/logger');

async function main() {
  const config = loadConfig();
  await checkPgDump();
  const result = await createBackupService(config).runBackup();
  if (result.success === false) process.exitCode = 1;
}

main().catch((error) => {
  logger.error('Manual backup failed', { error: error.message });
  process.exitCode = 1;
});
