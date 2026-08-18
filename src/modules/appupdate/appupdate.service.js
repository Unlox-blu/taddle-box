'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AppInfoParser = require('app-info-parser');
const redis = require('../../config/redis');

const DEFAULT_MANIFEST_PATH = path.join(__dirname, 'appupdate.manifest.json');
const APK_FOLDER = 'apks';
const APK_MIME = 'application/vnd.android.package-archive';
const S3_APK_KEY = `${APK_FOLDER}/taddlebox.apk`;
const REDIS_KEY = 'app_update_manifest';
const CACHE_TTL = 60 * 60 * 24 * 30; // 30 days in seconds

class AppUpdateService {
  constructor({ storageService }) {
    this.storageSvc = storageService;
  }

  _getS3Key(track) {
    return track === 'development' ? `${APK_FOLDER}/taddlebox-dev.apk` : `${APK_FOLDER}/taddlebox.apk`;
  }

  _getRedisKey(track) {
    return track === 'development' ? `${REDIS_KEY}:development` : REDIS_KEY;
  }

  _getManifestPath(track) {
    if (process.env.APP_UPDATE_MANIFEST_PATH) return process.env.APP_UPDATE_MANIFEST_PATH;
    return track === 'development'
      ? path.join(__dirname, 'appupdate.manifest.development.json')
      : DEFAULT_MANIFEST_PATH;
  }

  async processApk(filePath, track = 'production') {
    const s3Key = this._getS3Key(track);
    const redisKey = this._getRedisKey(track);
    const manifestPath = this._getManifestPath(track);
    try {
      // 1. Parse APK to get versionCode and validate package
      const parser = new AppInfoParser(filePath);
      const result = await parser.parse();
      
      const packageName = result.package || result.application?.package;
      if (packageName !== 'com.taddlebox.app') {
        throw new Error(`CRITICAL: The uploaded APK has an invalid package name (${packageName}). Expected com.taddlebox.app. Upload rejected to prevent publishing the wrong app!`);
      }

      const versionCode = result.versionCode || result.application?.versionCode;

      if (!versionCode) {
        throw new Error('Failed to extract versionCode from APK');
      }

      // 1.5. Prevent downgrades by checking the current live manifest
      const existingManifest = await this.getManifest(track);
      if (existingManifest && existingManifest.android && existingManifest.android.versionCode) {
        const liveVersion = Number(existingManifest.android.versionCode);
        const newVersion = Number(versionCode);
        if (newVersion < liveVersion) {
          throw new Error(`Upload rejected for track '${track}': The new APK has version code ${newVersion}, which is lower than the currently live version ${liveVersion}. Downgrading is not permitted.`);
        }
      }

      // 2. Generate security handshake
      const handshake = crypto.randomBytes(16).toString('hex');
      const s3Metadata = {
        versioncode: String(versionCode),
        packagename: packageName,
        handshake: handshake,
      };

      // 3. Upload APK to S3 with metadata
      console.log(`Uploading APK to S3 (${s3Key}) with handshake for track: ${track}...`);
      const apkUrl = await this.storageSvc.uploadFile(s3Key, filePath, APK_MIME, s3Metadata);

      // Get exact size for manifest
      const stat = fs.statSync(filePath);

      // 4. Construct manifest
      const manifest = {
        android: {
          versionCode: Number(versionCode),
          versionName: result.versionName || String(versionCode),
          url: apkUrl,
          size: stat.size,
          mandatory: false,
          changelog: 'A new update is available!',
        },
        _security: {
          packageName: packageName,
          handshake: handshake,
          lastUploaded: new Date().toISOString(),
        },
      };

      // 5. Save manifest directly to backend's local disk
      console.log(`Saving manifest to local disk at ${manifestPath}...`);
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      // 6. Instantly cache the verified manifest in Redis
      console.log('Caching verified manifest in Redis...');
      await redis.setex(redisKey, CACHE_TTL, JSON.stringify(manifest));

      return manifest;
    } finally {
      // 7. Delete temp file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }

  async getManifest(track = 'production') {
    const s3Key = this._getS3Key(track);
    const redisKey = this._getRedisKey(track);
    const manifestPath = this._getManifestPath(track);

    try {
      // Fast path: Check Redis cache first! (0 S3 hammering, 0 disk reads)
      const cached = await redis.get(redisKey);
      if (cached) {
        const manifest = JSON.parse(cached);
        if (manifest && manifest.android) return manifest;
      }

      // Slow path: Cache miss. We must perform the handshake to recover the cache.
      if (fs.existsSync(manifestPath)) {
        const raw = fs.readFileSync(manifestPath, 'utf8');
        const manifest = JSON.parse(raw);
        if (!manifest || !manifest.android) return { android: null };

        // Perform the S3 Handshake
        const s3Meta = await this.storageSvc.getMetadata(s3Key);

        // If S3 doesn't have the file, or metadata is missing, or handshake doesn't match
        if (
          !s3Meta ||
          s3Meta.handshake !== manifest._security?.handshake ||
          s3Meta.packagename !== manifest._security?.packageName
        ) {
          console.warn(
            '⚠️ S3 Metadata Handshake Failed! Someone may have manually uploaded an APK to S3.'
          );
          return { android: null };
        }

        // Handshake successful! Repopulate the Redis cache for the next 8 hours
        await redis.setex(redisKey, CACHE_TTL, JSON.stringify(manifest));
        return manifest;
      }
      return { android: null };
    } catch (error) {
      console.error('Failed to read local manifest or verify handshake:', error);
      return { android: null };
    }
  }

  /**
   * JIT Handshake: Called exactly when the user attempts to download the APK.
   * Performs the S3 Handshake. If it fails, it busts the cache and returns null.
   * If it succeeds, it returns the real CloudFront URL.
   */
  async verifyDownload(track = 'production') {
    const s3Key = this._getS3Key(track);
    const redisKey = this._getRedisKey(track);
    const manifestPath = this._getManifestPath(track);

    try {
      if (!fs.existsSync(manifestPath)) return null;
      
      const raw = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(raw);
      if (!manifest || !manifest._security) return null;

      // Perform the S3 Handshake
      const s3Meta = await this.storageSvc.getMetadata(s3Key);
      
      // If S3 doesn't have the file, or metadata is missing, or handshake doesn't match
      if (
        !s3Meta ||
        s3Meta.handshake !== manifest._security.handshake ||
        s3Meta.packagename !== manifest._security.packageName
      ) {
        console.warn(`⚠️ S3 Metadata Handshake Failed on Download for track ${track}! Busting cache and aborting.`);
        // BUST THE CACHE!
        await redis.del(redisKey);
        return null; // Return null so controller throws 404
      }

      // Handshake successful! Return the real CloudFront URL
      return manifest.android.url; // url contains the CloudFront link stored during processApk
    } catch (error) {
      console.error('Download verification failed:', error);
      return null;
    }
  }
}

module.exports = AppUpdateService;
