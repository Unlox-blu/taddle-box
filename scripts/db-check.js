#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DB_CONNECTION_STRING,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

const query = (text) => pool.query(text).then(r => r.rows);

async function main() {
  console.log('🔍 Tournament Data Analysis\n');

  // Status distribution
  console.log('📊 By Status:');
  const byStatus = await query(`
    SELECT status, COUNT(*) AS count
    FROM game_tournament
    GROUP BY status
    ORDER BY count DESC
  `);
  for (const r of byStatus) {
    console.log(`   ${r.status.padEnd(20)} ${r.count.toLocaleString()} rows`);
  }

  // Date distribution
  console.log('\n📅 By Age:');
  const byAge = await query(`
    SELECT
      CASE
        WHEN created_at > NOW() - INTERVAL '1 day' THEN 'Last 24h'
        WHEN created_at > NOW() - INTERVAL '7 days' THEN 'Last 7 days'
        WHEN created_at > NOW() - INTERVAL '30 days' THEN 'Last 30 days'
        WHEN created_at > NOW() - INTERVAL '90 days' THEN 'Last 90 days'
        ELSE 'Older than 90 days'
      END AS age,
      COUNT(*) AS count
    FROM game_tournament
    GROUP BY 1
    ORDER BY MIN(created_at) DESC
  `);
  for (const r of byAge) {
    console.log(`   ${r.age.padEnd(25)} ${r.count.toLocaleString()} rows`);
  }

  // Entry distribution
  console.log('\n📊 Tournament Entries:');
  const entries = await query(`SELECT COUNT(*) AS count FROM game_tournament_entry`);
  console.log(`   Total entries: ${entries[0].count.toLocaleString()}`);

  // Entries per tournament
  console.log('\n📈 Entries per Tournament (top 10):');
  const perTourney = await query(`
    SELECT t.id, t.title, t.status, t.created_at::date AS created, COUNT(e.id) AS entries
    FROM game_tournament t
    LEFT JOIN game_tournament_entry e ON e.tournament_id = t.id
    GROUP BY t.id, t.title, t.status, t.created_at
    ORDER BY entries DESC
    LIMIT 10
  `);
  for (const r of perTourney) {
    console.log(`   ${r.entries.toString().padStart(6)} entries | ${r.status.padEnd(12)} | ${r.created} | ${r.title || r.id.substring(0, 8)}`);
  }

  // Is tournament recurring? Check metadata
  console.log('\n🔁 Recurring Tournaments:');
  const recurring = await query(`
    SELECT
      metadata->>'type' AS type,
      COUNT(*) AS count
    FROM game_tournament
    WHERE metadata->>'type' IS NOT NULL
    GROUP BY metadata->>'type'
  `);
  if (recurring.length === 0) {
    console.log('   None found');
  } else {
    for (const r of recurring) {
      console.log(`   ${(r.type || 'null').padEnd(20)} ${r.count.toLocaleString()} rows`);
    }
  }

  await pool.end();
}

main().catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
