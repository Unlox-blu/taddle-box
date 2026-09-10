'use strict';
// Audit: list all columns whose names hint at a specific vendor/technology
// (the media.cloudfront_url problem) or that may be misleading.
require('dotenv').config();
const { Pool } = require('pg');
const pool = require('../src/config/database');

const VENDOR_HINTS = [
  'cloudfront', 'vimeo', 'cloudinary', 'firebase', 'fcm', 'onesignal',
  'sentry', 'mixpanel', 'amplitude', 'twilio', 'stripe', 'razorpay',
  'paypal', 'sendgrid', 'mailgun', 's3_', 'aws_', 'gcs', 'auth0',
  'supabase', 'ngrok', 'google_', 'apple_', 'facebook_', 'github_',
  'imgtree', 'pravatar', 'youtube', 'twitter', 'instagram',
];

(async () => {
  const { rows } = await pool.query(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, ordinal_position`
  );

  const hits = rows.filter((r) =>
    VENDOR_HINTS.some((h) => r.column_name.toLowerCase().includes(h))
  );
  console.log('=== Vendor-named columns ===');
  for (const r of hits) console.log(`${r.table_name}.${r.column_name} (${r.data_type})`);
  if (hits.length === 0) console.log('(none)');

  // Tables with url-ish columns to eyeball for misleading names
  console.log('\n=== *_url columns (for misleading-name review) ===');
  for (const r of rows.filter((x) => x.column_name.endsWith('_url'))) {
    console.log(`${r.table_name}.${r.column_name} (${r.data_type})`);
  }

  await pool.end();
})().catch((e) => {
  console.error('FATAL:', e.message);
  return pool.end().then(() => process.exit(1));
});
