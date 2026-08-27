const path = require('node:path');
const dotenv = require('dotenv');

function loadConfig(options = {}) {
  const env = options.env || process.env;
  if (options.loadEnv !== false) dotenv.config({ path: options.envPath || path.resolve(process.cwd(), '.env') });

  const values = {
    databaseUrl: env.DB_CONNECTION_STRING,
    backupDir: env.BACKUP_DIR,
    schedule: env.BACKUP_SCHEDULE,
    timezone: env.TIMEZONE,
    maxRetries: Number(env.MAX_BACKUP_RETRIES)
  };
  const missing = ['DB_CONNECTION_STRING', 'BACKUP_DIR', 'BACKUP_SCHEDULE', 'TIMEZONE', 'MAX_BACKUP_RETRIES']
    .filter((name) => !env[name]);
  if (missing.length) throw new Error(`Missing required configuration: ${missing.join(', ')}`);

  let parsedUrl;
  try { parsedUrl = new URL(values.databaseUrl); } catch { throw new Error('DB_CONNECTION_STRING must be a valid PostgreSQL connection string'); }
  if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
    throw new Error('DB_CONNECTION_STRING must use the postgres:// or postgresql:// scheme');
  }
  if (!values.schedule.trim()) throw new Error('BACKUP_SCHEDULE cannot be empty');
  if (!Number.isInteger(values.maxRetries) || values.maxRetries < 1) {
    throw new Error('MAX_BACKUP_RETRIES must be a positive integer');
  }
  try { new Intl.DateTimeFormat('en-US', { timeZone: values.timezone }).format(); }
  catch { throw new Error(`TIMEZONE is invalid: ${values.timezone}`); }

  return { ...values, backupDir: path.resolve(options.cwd || process.cwd(), values.backupDir) };
}

module.exports = { loadConfig };
