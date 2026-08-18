'use strict';

/**
 * GET /game-assets/* — serves the game logos + sounds to the app.
 *
 * The client NEVER talks to S3 directly: the backend streams the objects from
 * S3 (the origin, pushed by scripts/upload-game-assets.js) so the bucket name
 * stays server-side and a CDN can be dropped in front of the API later
 * without an app rebuild. Long cache headers are safe because artwork
 * filenames change (or GAME_ASSET_VERSION bumps) when a release updates them.
 *
 * Revalidation: the S3 ETag + Last-Modified are passed through on every 200,
 * and conditional requests (If-None-Match / If-Modified-Since) short-circuit
 * with a 304 without streaming the body — one HEAD to S3 instead of a full
 * GET. The disk fallback (res.sendFile) handles its own ETag/304.
 *
 * The mount point in app.js wraps this router in a Redis-backed per-IP rate
 * limiter (assetRateLimiter) so a scraper can't hammer the S3 proxy.
 *
 * Fallback: if S3 is unreachable or the object is missing, the route serves
 * the local disk copy (GAME_ASSETS_DIR, default taddle-box/game-assets/) so
 * dev/offline boxes still work. Unknown/suspicious paths 404 via the global
 * notFoundHandler. Lives inside src/modules/game/ with the rest of the game
 * domain.
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const { GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, BUCKET_NAME } = require('../../config/s3');

const router = express.Router();

const CACHE_CONTROL = 'public, max-age=31536000';
const S3_PREFIX = 'game-assets/';
const ALLOWED_PREFIXES = ['logos/', 'sounds/'];
const ALLOWED_EXT = new Set(['.webp', '.wav', '.png', '.jpg', '.jpeg', '.json']);
const DISK_DIR =
  process.env.GAME_ASSETS_DIR || path.join(__dirname, '..', '..', '..', 'game-assets');

function isSafeRel(rel) {
  if (!rel) return false;
  if (rel.includes('..') || rel.includes('\\') || path.isAbsolute(rel)) return false;
  if (!ALLOWED_PREFIXES.some((p) => rel.startsWith(p))) return false;
  return ALLOWED_EXT.has(path.extname(rel).toLowerCase());
}

/** True when the client's conditional headers match — answer 304. */
function isNotModified(req, etag, lastModified) {
  const inm = req.headers['if-none-match'];
  if (inm && etag) {
    return inm.split(',').some((tag) => {
      const t = tag.trim();
      return t === '*' || t === etag;
    });
  }
  const ims = req.headers['if-modified-since'];
  if (ims && lastModified) {
    const since = Date.parse(ims);
    return !Number.isNaN(since) && lastModified.getTime() <= since;
  }
  return false;
}

function serveFromDisk(rel, res, next) {
  const localFile = path.join(DISK_DIR, rel);
  if (fs.existsSync(localFile)) {
    res.setHeader('Cache-Control', CACHE_CONTROL);
    // sendFile emits its own ETag/Last-Modified and answers 304 itself.
    return res.sendFile(localFile);
  }
  return next();
}

router.get('/*splat', async (req, res, next) => {
  // Express 5 returns the splat as an array of segments — join before use.
  const raw = Array.isArray(req.params.splat)
    ? req.params.splat.join('/')
    : req.params.splat || '';
  let rel;
  try {
    rel = decodeURIComponent(raw);
  } catch {
    return next();
  }
  if (!isSafeRel(rel)) return next();

  const key = S3_PREFIX + rel;

  // Conditional request → resolve metadata first (HEAD) so we can answer 304
  // without streaming the body. Plain requests skip straight to GET and pass
  // the S3 ETag/Last-Modified through for future revalidations.
  const hasConditional = !!(
    req.headers['if-none-match'] || req.headers['if-modified-since']
  );
  if (hasConditional) {
    try {
      const head = await s3Client.send(
        new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
      );
      res.setHeader('Cache-Control', CACHE_CONTROL);
      if (head.ETag) res.setHeader('ETag', head.ETag);
      if (head.LastModified) {
        res.setHeader('Last-Modified', head.LastModified.toUTCString());
      }
      if (isNotModified(req, head.ETag, head.LastModified)) {
        return res.status(304).end();
      }
    } catch (err) {
      if (err && err.name !== 'NoSuchKey' && err.name !== 'NotFound') {
        console.warn(`[game-assets] S3 HEAD failed for ${rel}: ${err?.message}`);
      }
      return serveFromDisk(rel, res, next);
    }
  }

  try {
    const { Body, ContentType, ETag, LastModified } = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
    );
    res.setHeader('Cache-Control', CACHE_CONTROL);
    if (ETag) res.setHeader('ETag', ETag);
    if (LastModified) res.setHeader('Last-Modified', LastModified.toUTCString());
    if (ContentType) res.setHeader('Content-Type', ContentType);
    Body.on('error', () => {
      res.destroy();
    });
    return Body.pipe(res);
  } catch (err) {
    if (!err || (err.name !== 'NoSuchKey' && err.name !== 'NotFound')) {
      console.warn(`[game-assets] S3 GET failed for ${rel}: ${err?.message}`);
    }
    return serveFromDisk(rel, res, next);
  }
});

module.exports = router;
