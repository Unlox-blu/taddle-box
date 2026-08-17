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
    this.manifestPath = process.env.APP_UPDATE_MANIFEST_PATH || DEFAULT_MANIFEST_PATH;
  }

  async processApk(filePath) {
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

      // 2. Generate security handshake
      const handshake = crypto.randomBytes(16).toString('hex');
      const s3Metadata = {
        versioncode: String(versionCode),
        packagename: packageName,
        handshake: handshake,
      };

      // 3. Upload APK to S3 with metadata
      console.log(`Uploading APK to S3 (${S3_APK_KEY}) with handshake...`);
      const apkUrl = await this.storageSvc.uploadFile(S3_APK_KEY, filePath, APK_MIME, s3Metadata);

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
      console.log(`Saving manifest to local disk at ${this.manifestPath}...`);
      fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2));

      // 6. Instantly cache the verified manifest in Redis
      console.log('Caching verified manifest in Redis...');
      await redis.setex(REDIS_KEY, CACHE_TTL, JSON.stringify(manifest));

      return manifest;
    } finally {
      // 7. Delete temp file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }

  async getManifest() {
    try {
      // Fast path: Check Redis cache first! (0 S3 hammering, 0 disk reads)
      const cached = await redis.get(REDIS_KEY);
      if (cached) {
        const manifest = JSON.parse(cached);
        if (manifest && manifest.android) return manifest;
      }

      // Slow path: Cache miss. We must perform the handshake to recover the cache.
      if (fs.existsSync(this.manifestPath)) {
        const raw = fs.readFileSync(this.manifestPath, 'utf8');
        const manifest = JSON.parse(raw);
        if (!manifest || !manifest.android) return { android: null };

        // Perform the S3 Handshake
        const s3Meta = await this.storageSvc.getMetadata(S3_APK_KEY);

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
        await redis.setex(REDIS_KEY, CACHE_TTL, JSON.stringify(manifest));
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
  async verifyDownload() {
    try {
      if (!fs.existsSync(this.manifestPath)) return null;
      
      const raw = fs.readFileSync(this.manifestPath, 'utf8');
      const manifest = JSON.parse(raw);
      if (!manifest || !manifest._security) return null;

      // Perform the S3 Handshake
      const s3Meta = await this.storageSvc.getMetadata(S3_APK_KEY);
      
      // If S3 doesn't have the file, or metadata is missing, or handshake doesn't match
      if (
        !s3Meta ||
        s3Meta.handshake !== manifest._security.handshake ||
        s3Meta.packagename !== manifest._security.packageName
      ) {
        console.warn('⚠️ S3 Metadata Handshake Failed on Download! Busting cache and aborting.');
        // BUST THE CACHE!
        await redis.del(REDIS_KEY);
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
