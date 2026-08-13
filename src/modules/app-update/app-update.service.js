'use strict';

const fs = require('fs');
const path = require('path');
const { createError } = require('../../utils/error.util');
const { CLOUDFRONT_DOMAIN } = require('../../config/s3');

const DEFAULT_MANIFEST_PATH = path.join(__dirname, 'app-update.manifest.json');

// S3 key prefix for release APKs and the content type used for uploads.
const APK_FOLDER = 'apks';
const APK_MIME = 'application/vnd.android.package-archive';
// Plain, safe object name: no slashes, no leading dots, must end in .apk.
const APK_FILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.apk$/;

/**
 * Serves the APK update manifest from a plain JSON file so pushing a new
 * version to testers is a single edit — no DB, no redeploy of logic.
 * Point APP_UPDATE_MANIFEST_PATH at another file to keep it out of the repo.
 */
class AppUpdateService {
  constructor({ storageService }) {
    this.manifestPath = process.env.APP_UPDATE_MANIFEST_PATH || DEFAULT_MANIFEST_PATH;
    this.storageSvc = storageService;
  }

  getManifest() {
    try {
      const raw = fs.readFileSync(this.manifestPath, 'utf8');
      const manifest = JSON.parse(raw);
      return manifest && manifest.android ? manifest : { android: null };
    } catch (error) {
      // Missing / unreadable / invalid manifest ⇒ nothing to push.
      return { android: null };
    }
  }

  /**
   * Generates a presigned S3 PUT URL for a release APK (the publish:update:direct
   * script uploads the file straight to S3, then writes the returned URL into
   * the manifest — same pattern as the media module).
   *
   * @returns {Promise<{uploadUrl: string, s3Key: string, finalUrl: string}>}
   */
  async getPresignedUploadUrl({ fileName }) {
    const base = path.basename(fileName || '');
    if (base !== fileName || !APK_FILE_NAME_RE.test(base)) {
      throw createError('fileName must be a plain .apk filename (no path)', 400);
    }
    if (!CLOUDFRONT_DOMAIN) {
      throw createError('CLOUDFRONT_DOMAIN is not configured', 500);
    }

    const s3Key = `${APK_FOLDER}/${base}`;
    const uploadUrl = await this.storageSvc.getSignedUploadUrl(s3Key, APK_MIME);
    const finalUrl = `${CLOUDFRONT_DOMAIN}/${s3Key}`;

    return { uploadUrl, s3Key, finalUrl };
  }

  /**
   * Deletes a release APK from S3 (used by publish:update:direct to prune the
   * previous build once the new one is published). Only ever touches the
   * apks/ folder — the fileName is validated the same way as presign.
   *
   * @returns {Promise<{s3Key: string}>}
   */
  async deleteApk({ fileName }) {
    const base = path.basename(fileName || '');
    if (base !== fileName || !APK_FILE_NAME_RE.test(base)) {
      throw createError('fileName must be a plain .apk filename (no path)', 400);
    }

    const s3Key = `${APK_FOLDER}/${base}`;
    await this.storageSvc.deleteFile(s3Key);
    return { s3Key };
  }
}

module.exports = AppUpdateService;
