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
      // Env
      env: {
        NODE_ENV: 'development',
        PORT: 8080,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 8080,
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
