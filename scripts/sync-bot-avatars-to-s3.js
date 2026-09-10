'use strict';
/**
 * One-off migration script: bot avatars → S3 (SSOT, same path as user avatars).
 *
 * - Downloads each bot's current third-party avatar (pravatar.cc / imgtree.co).
 * - Uploads it to S3 under avatars/bots/<botId>.<ext> — the same public-URL
 *   scheme real user avatars use (CLOUDFRONT_DOMAIN/<key>, no signed URLs).
 * - Updates bots.avatar with the new S3 URL.
 *
 * Idempotent: bots already hosted on our bucket are skipped, so re-running is safe.
 *
 * Usage:
 *   node scripts/sync-bot-avatars-to-s3.js           # apply
 *   node scripts/sync-bot-avatars-to-s3.js --dry-run # preview only
 */

require('dotenv').config();
const { Pool } = require('pg');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, BUCKET_NAME, CLOUDFRONT_DOMAIN } = require('../src/config/s3');

const DRY_RUN = process.argv.includes('--dry-run');
const BUCKET_HOST = BUCKET_NAME + '.s3.';

// Replacement sources for bots whose third-party URL is dead (imgtree.co
// returns HTTP 500). Deterministic, unused-by-other-bots pravatar images —
// once downloaded they're hosted on our S3, so the third-party dependency
// disappears either way.
const FALLBACK_SOURCES = {
  bot_002: 'https://i.pravatar.cc/150?img=47',
  bot_008: 'https://i.pravatar.cc/150?img=44',
};

const pool = require('../src/config/database');

const extFromContentType = (ct) => {
  if (!ct) return 'jpg';
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('gif')) return 'gif';
  return 'jpg';
};

const isOurS3Url = (url) => url && url.includes(BUCKET_HOST);

async function downloadAvatar(url) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  if (buffer.length < 1000) throw new Error(`suspiciously small (${buffer.length} bytes)`);
  return { buffer, contentType };
}

async function uploadToS3(key, buffer, contentType) {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
  return `${CLOUDFRONT_DOMAIN}/${key}`;
}

(async () => {
  console.log(`Bot avatar sync ${DRY_RUN ? '(DRY RUN)' : ''} → bucket: ${BUCKET_NAME}\n`);

  const { rows: bots } = await pool.query(
    `SELECT id, username, avatar FROM bots WHERE avatar IS NOT NULL ORDER BY id`
  );
  console.log(`Found ${bots.length} bots.\n`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const bot of bots) {
    if (isOurS3Url(bot.avatar)) {
      console.log(`  SKIP ${bot.id} — already on our S3`);
      skipped++;
      continue;
    }
    try {
      const sourceUrl = FALLBACK_SOURCES[bot.id] || bot.avatar;
      if (sourceUrl !== bot.avatar) {
        console.log(`  NOTE ${bot.id} — original URL dead (imgtree.co), substituting ${sourceUrl}`);
      }
      const { buffer, contentType } = await downloadAvatar(sourceUrl);
      const ext = extFromContentType(contentType);
      const key = `avatars/bots/${bot.id}.${ext}`;
      const s3Url = await uploadToS3(key, buffer, contentType);

      if (!DRY_RUN) {
        await pool.query(`UPDATE bots SET avatar = $1, updated_at = NOW() WHERE id = $2`, [
          s3Url,
          bot.id,
        ]);
      }
      console.log(`  OK   ${bot.id} (${bot.username}) — ${bot.avatar} → ${s3Url} (${buffer.length} bytes)`);
      migrated++;
    } catch (err) {
      console.error(`  FAIL ${bot.id} — ${bot.avatar}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${migrated} migrated, ${skipped} skipped, ${failed} failed.`);
  await pool.end();
  if (failed > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e.message);
  return pool.end().then(() => process.exit(1));
});
