'use strict';

/**
 * Mirrors third-party images used by the frontend (game card art, default
 * avatar, …) into S3 so the backend becomes the single source of truth and
 * the app never talks to an external image host (or the bucket) directly.
 *
 * Downloads each manifest URL and uploads it under
 * s3://<S3_BUCKET_NAME>/app-assets/games/cards/... (and lottie under
 * app-assets/lottie/) — served to the app via GET /app-assets/... (see
 * src/modules/game/gameassets.route.js).
 *
 * Usage:
 *   node scripts/sync-third-party-images.js
 *
 * Env (same .env the server uses): AWS_REGION, AWS_ACCESS_KEY_ID,
 * AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME.
 *
 * Re-runnable: uploads overwrite the same keys with long cache headers.
 * Add/remove entries in MANIFEST when the frontend's image references change.
 */
require('dotenv').config();

const https = require('https');
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, BUCKET_NAME } = require('../src/config/s3');

// Default destination prefix (game card art). Entries may override with their
// own `dir` (e.g. lottie files live under app-assets/lottie/). Mirrors the
// public URL scheme: /app-assets/<prefix>/<file>.
const PREFIX = 'app-assets/games/cards/';
const CACHE_CONTROL = 'public, max-age=31536000';

// Original URL → destination key under the PREFIX above. Keep in sync with
// the frontend references (taddlebox-app/src/games/assets.ts imageUrl fields).
// Note: the frontend's old default-avatar S3 reference was a 404 and has been
// replaced with the app's standard icon fallback — no placeholder to mirror.
const MANIFEST = [
  // Game card art (Unsplash) — one per game slug. tap-rush and ludo shared
  // the same image; each gets its own key so the mapping stays 1:1.
  { url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=600&auto=format&fit=crop', key: 'tap-rush.jpg' },
  { url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=600&auto=format&fit=crop', key: 'ludo.jpg' },
  { url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=600&auto=format&fit=crop', key: 'memory-grid.jpg' },
  { url: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?q=80&w=600&auto=format&fit=crop', key: 'scribble.jpg' },
  { url: 'https://images.unsplash.com/photo-1570303363992-7f95ee20ebdb?q=80&w=600&auto=format&fit=crop', key: 'snake-ladder.jpg' },
  { url: 'https://images.unsplash.com/photo-1586165368502-1bad197a6461?q=80&w=600&auto=format&fit=crop', key: 'chess.jpg' },
  { url: 'https://images.unsplash.com/photo-1555448248-2571daf6344b?q=80&w=600&auto=format&fit=crop', key: 'word-rush.jpg' },
  // Logo Lottie animation (splash/loaders) — app branding, NOT game content:
  // lives under /app-assets/lottie/. (The old banner lottie URL never
  // existed in the bucket and was already dropped by the app.)
  { url: 'https://unlox-dev-test.s3.ap-south-1.amazonaws.com/app-assets/app_logo_lottie/taddle_lottie.lottie', key: 'taddle_lottie.lottie', dir: 'app-assets/lottie/' },
];

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function put(buffer, s3Key, contentType) {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: CACHE_CONTROL,
    }),
  );
}

/**
 * Fallback for sources inside our OWN bucket that aren't publicly readable:
 * fetch via the SDK (server-side creds, not public GET) and re-upload.
 */
async function mirrorFromOwnBucket(url, s3Key) {
  const srcUrl = new URL(url);
  if (!srcUrl.hostname.includes('s3.') || !srcUrl.hostname.includes('amazonaws.com')) {
    throw new Error(`not an S3 source: ${url}`);
  }
  const srcKey = decodeURIComponent(srcUrl.pathname.replace(/^\//, ''));
  const obj = await s3Client.send(
    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: srcKey }),
  );
  const body = await streamToBuffer(obj.Body);
  await put(body, s3Key, obj.ContentType || 'image/png');
}

/** GET a URL with redirect following (up to 5 hops), returning a Buffer. */
function download(url, hops = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'taddle-assets-sync/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (hops >= 5) return reject(new Error(`Too many redirects for ${url}`));
          return resolve(download(new URL(res.headers.location, url).toString(), hops + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            buffer: Buffer.concat(chunks),
            contentType: res.headers['content-type'] || 'application/octet-stream',
          }),
        );
      })
      .on('error', reject);
  });
}

async function main() {
  if (!BUCKET_NAME) {
    console.error('❌ Missing S3_BUCKET_NAME in .env');
    process.exit(1);
  }
  console.log(`📦 Mirroring ${MANIFEST.length} third-party images → s3://${BUCKET_NAME}/${PREFIX}`);
  for (const { url, key, dir } of MANIFEST) {
    const s3Key = (dir || PREFIX) + key;
    try {
      const { buffer, contentType } = await download(url);
      await put(buffer, s3Key, contentType);
      console.log(`  ✓ ${key} (${(buffer.length / 1024).toFixed(0)} KB, ${contentType}) ← ${url}`);
    } catch {
      try {
        await mirrorFromOwnBucket(url, s3Key);
        console.log(`  ✓ ${key} (same-bucket copy) ← ${url}`);
      } catch (err2) {
        console.error(`  ✗ ${key} failed: ${err2.message}`);
        process.exitCode = 1;
      }
    }
  }
  console.log(`✅ Done. Serve via GET /app-assets/third-party/<key>`);
}

main();
