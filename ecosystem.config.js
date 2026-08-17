'use strict';

// PM2 process manager configuration.

module.exports = {
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
      // Env — PORT is what nginx proxies to (127.0.0.1:1999, see
      // nginx/nginx.conf). PM2 injects this as an env var, so it OVERRIDES
      // .env's PORT (dotenv never replaces an existing env var) — keep the
      // two in sync.
      env: {
        NODE_ENV: 'development',
        PORT: 1999,
      },
      env_production: {
        NODE_ENV: 'production',
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
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
