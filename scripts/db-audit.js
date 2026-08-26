#!/usr/bin/env node
'use strict';

/**
 * Neon DB Storage Audit
 * 
 * Run: node scripts/db-audit.js
 * 
 * Connects to your database using the same config as the server,
 * runs diagnostic queries, and prints a storage report.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DB_CONNECTION_STRING,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

const query = (text) => pool.query(text).then(r => r.rows);

const divider = () => console.log('\n' + '═'.repeat(80) + '\n');

async function main() {
  console.log('🔍 Neon DB Storage Audit');
  console.log(`   Connecting to: ${process.env.DB_HOST || 'via connection string'}`);

  const client = await pool.connect();
  console.log('   ✅ Connected\n');
  client.release();

  // ── 1. Total database size ──────────────────────────────────────────
  const [dbSize] = await query(`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`);
  console.log(`📊 Total Database Size: ${dbSize.size}`);
  divider();

  // ── 2. Top tables by total size (data + indexes + TOAST) ────────────
  console.log('📦 Top Tables by Size:');
  console.log('   ' + '-'.repeat(76));
  console.log(`   ${'Table'.padEnd(35)} ${'Data'.padEnd(12)} ${'Indexes'.padEnd(12)} ${'Total'.padEnd(12)} ${'Rows'.padEnd(10)}`);
  console.log('   ' + '-'.repeat(76));

  const tables = await query(`
    SELECT
      s.relname AS table_name,
      pg_size_pretty(pg_table_size(s.relid)) AS data_size,
      pg_size_pretty(pg_indexes_size(s.relid)) AS index_size,
      pg_size_pretty(pg_total_relation_size(s.relid)) AS total_size,
      pg_total_relation_size(s.relid) AS total_bytes,
      COALESCE(st.n_live_tup, 0) AS live_rows,
      COALESCE(st.n_dead_tup, 0) AS dead_rows
    FROM pg_catalog.pg_statio_user_tables s
    LEFT JOIN pg_stat_user_tables st ON st.relname = s.relname
    ORDER BY pg_total_relation_size(s.relid) DESC
    LIMIT 15
  `);

  for (const t of tables) {
    console.log(`   ${t.table_name.padEnd(35)} ${t.data_size.padEnd(12)} ${t.index_size.padEnd(12)} ${t.total_size.padEnd(12)} ${(t.live_rows || 0).toLocaleString().padEnd(10)}`);
  }
  divider();

  // ── 3. Top indexes by size ──────────────────────────────────────────
  console.log('📑 Top Indexes by Size:');
  console.log('   ' + '-'.repeat(76));
  console.log(`   ${'Table'.padEnd(25)} ${'Index'.padEnd(35)} ${'Size'.padEnd(12)} ${'Scans'.padEnd(8)}`);
  console.log('   ' + '-'.repeat(76));

  const indexes = await query(`
    SELECT
      relname AS tablename,
      indexrelname AS indexname,
      pg_size_pretty(pg_relation_size(indexrelid)) AS size,
      pg_relation_size(indexrelid) AS size_bytes,
      idx_scan
    FROM pg_stat_user_indexes
    ORDER BY pg_relation_size(indexrelid) DESC
    LIMIT 20
  `);

  for (const idx of indexes) {
    console.log(`   ${(idx.tablename || '').padEnd(25)} ${(idx.indexname || '').padEnd(35)} ${idx.size.padEnd(12)} ${(idx.idx_scan || 0).toLocaleString().padEnd(8)}`);
  }
  divider();

  // ── 4. Dead row bloat ──────────────────────────────────────────────
  console.log('💀 Dead Row Analysis:');
  console.log('   ' + '-'.repeat(76));
  console.log(`   ${'Table'.padEnd(30)} ${'Live'.padEnd(12)} ${'Dead'.padEnd(12)} ${'Dead %'.padEnd(10)} ${'Status'.padEnd(10)}`);
  console.log('   ' + '-'.repeat(76));

  const bloat = await query(`
    SELECT
      relname AS table_name,
      COALESCE(n_live_tup, 0) AS n_live_tup,
      COALESCE(n_dead_tup, 0) AS n_dead_tup,
      ROUND(
        100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0),
        1
      ) AS dead_pct
    FROM pg_stat_user_tables
    WHERE (COALESCE(n_live_tup, 0) + COALESCE(n_dead_tup, 0)) > 0
    ORDER BY n_dead_tup DESC
    LIMIT 15
  `);

  for (const b of bloat) {
    const pct = b.dead_pct || 0;
    let status = '✅ OK';
    if (pct > 50) status = '🔴 VACUUM NOW';
    else if (pct > 20) status = '🟡 VACUUM SOON';
    console.log(`   ${(b.table_name || '').padEnd(30)} ${(b.n_live_tup || 0).toLocaleString().padEnd(12)} ${(b.n_dead_tup || 0).toLocaleString().padEnd(12)} ${(pct + '%').padEnd(10)} ${status}`);
  }
  divider();

  // ── 5. Unused indexes ───────────────────────────────────────────────
  console.log('🚫 Unused Indexes (idx_scan = 0, size > 100KB):');
  console.log('   ' + '-'.repeat(76));

  const unused = await query(`
    SELECT
      relname AS tablename,
      indexrelname AS indexname,
      pg_size_pretty(pg_relation_size(indexrelid)) AS size,
      pg_relation_size(indexrelid) AS size_bytes
    FROM pg_stat_user_indexes
    WHERE indexrelname NOT LIKE '%_pkey'
      AND idx_scan = 0
      AND pg_relation_size(indexrelid) > 102400
    ORDER BY pg_relation_size(indexrelid) DESC
    LIMIT 10
  `);

  if (unused.length === 0) {
    console.log('   None found ✅');
  } else {
    for (const u of unused) {
      console.log(`   ${(u.tablename || '').padEnd(25)} ${(u.indexname || '').padEnd(35)} ${u.size.padEnd(12)}`);
    }
  }
  divider();

  // ── 6. Table row counts (approximate) ──────────────────────────────
  console.log('📈 Table Row Counts:');
  console.log('   ' + '-'.repeat(76));

  const rows = await query(`
    SELECT relname, n_live_tup
    FROM pg_stat_user_tables
    WHERE n_live_tup > 0
    ORDER BY n_live_tup DESC
    LIMIT 15
  `);

  for (const r of rows) {
    console.log(`   ${r.relname.padEnd(35)} ${r.n_live_tup.toLocaleString().padEnd(15)} rows`);
  }
  divider();

  // ── 7. Summary ─────────────────────────────────────────────────────
  const totalIndexBytes = indexes.reduce((sum, i) => sum + (i.size_bytes || 0), 0);
  const totalTableBytes = tables.reduce((sum, t) => sum + (t.total_bytes || 0), 0);
  const totalDeadRows = bloat.reduce((sum, b) => sum + (b.n_dead_tup || 0), 0);

  console.log('📋 Summary:');
  console.log(`   Total DB size:        ${dbSize.size}`);
  console.log(`   Top ${tables.length} tables:       ${totalTableBytes ? (totalTableBytes / 1024 / 1024).toFixed(1) + ' MB' : 'N/A'}`);
  console.log(`   Top ${indexes.length} indexes:      ${totalIndexBytes ? (totalIndexBytes / 1024 / 1024).toFixed(1) + ' MB' : 'N/A'}`);
  console.log(`   Total dead rows:      ${totalDeadRows.toLocaleString()}`);
  console.log(`   Unused indexes:       ${unused.length}`);
  console.log('');

  await pool.end();
}

main().catch(err => {
  console.error('❌ Audit failed:', err.message);
  process.exit(1);
});
