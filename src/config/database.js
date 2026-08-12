'use strict';

const { Pool } = require('pg');
const config = require('./app.config');

// const pool = new Pool({
//   host: config.DB.host,
//   port: config.DB.port,
//   user: config.DB.user,
//   password: config.DB.password,
//   database: config.DB.database,
//   max: config.DB.max,
//   idleTimeoutMillis: 30000,
//   connectionTimeoutMillis: 2000,
//   ssl: config.DB.ssl ? { rejectUnauthorized: false } : false,
// });

const pool = new Pool({
  connectionString: config.DB.connectionString,
  max: config.DB.max,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: config.DB.ssl ? { rejectUnauthorized: false } : false,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  statement_timeout: 15000,
  query_timeout: 15000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

module.exports = pool;
