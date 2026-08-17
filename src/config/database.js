'use strict';

const { Pool } = require('pg');
const config = require('./app.config');

// pg-connection-string v2 treats the SSL modes 'prefer' / 'require' /
// 'verify-ca' as aliases for 'verify-full', and pg v9 will silently switch
// them to weaker libpq semantics (where 'require' does NOT verify the
// server cert). Pin those aliases to 'verify-full' — the behavior we have
// today — so a pg upgrade can never downgrade TLS without anyone noticing.
// Only the sslmode query param is touched; 'disable' / 'no-verify' / absent
// are left exactly as the operator wrote them.
const ALIASED_SSL_MODES = new Set(['prefer', 'require', 'verify-ca']);
const pinSslModeVerifyFull = (connectionString) => {
  const queryIdx = connectionString.indexOf('?');
  if (queryIdx === -1) return connectionString;
  const prefix = connectionString.slice(0, queryIdx + 1);
  const parts = connectionString
    .slice(queryIdx + 1)
    .split('&')
    .map((param) => {
      const [key, value] = param.split('=');
      if (key === 'sslmode' && ALIASED_SSL_MODES.has((value || '').toLowerCase())) {
        return 'sslmode=verify-full';
      }
      return param;
    });
  return prefix + parts.join('&');
};

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
  connectionString: config.DB.connectionString
    ? pinSslModeVerifyFull(config.DB.connectionString)
    : undefined,
  max: config.DB.max,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  // Only used when NO connection string is provided (individual DB_* vars).
  // When a connection string is set, its sslmode wins (pg merges it over this
  // option), which is exactly what pinSslModeVerifyFull makes explicit.
  ssl: config.DB.connectionString ? undefined : config.DB.ssl ? { rejectUnauthorized: false } : false,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  statement_timeout: 15000,
  query_timeout: 15000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

module.exports = pool;
