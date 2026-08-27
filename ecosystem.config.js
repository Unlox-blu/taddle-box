'use strict';

// PM2 process manager configuration.

module.exports = {
  // ── Log rotation (pm2-logrotate) ─────────────────────────────────
  // Install once: pm2 install pm2-logrotate
  // Config is set via pm2 set, not here — see deploy notes below.
  //
  // pm2 set pm2-logrotate:max_size 10M      (rotate when file hits 10 MB)
  // pm2 set pm2-logrotate:retain 5          (keep 5 rotated files)
  // pm2 set pm2-logrotate:compress true     (gzip old logs)
  // pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
  // pm2 set pm2-logrotate:rotateInterval '0 0 * * *'  (daily)
  // pm2 set pm2-logrotate:workerInterval 30  (check every 30s)

  apps: [
    {
      name: 'taddle-backend',
      script: 'server.js',
      instances: 'max',       // one per CPU core
      exec_mode: 'cluster',   // load-balanced
      watch: false,
      max_memory_restart: '512M',
      kill_timeout: 5000,
      listen_timeout: 3000,
      // Log files
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Log rotation — pm2-logrotate watches these files
      max_size: '10M',
      // Env — PORT is what nginx proxies to (127.0.0.1:1999, see
      // nginx/nginx.conf). PM2 injects this as an env var, so it OVERRIDES
      // .env's PORT (dotenv never replaces an existing env var) — keep the
      // two in sync.
      env: {
        PORT: 1999,
      },
    },
    {
      name: 'taddle-workers',
      script: 'src/jobs/workers/start-workers.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '256M',
      kill_timeout: 10000,
      error_file: './logs/workers-error.log',
      out_file: './logs/workers-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {},
    },
  ],
};
