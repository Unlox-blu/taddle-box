'use strict';

const { apiResponse } = require('../../utils/response.util');
const { createError } = require('../../utils/error.util');
const config = require('../../config/app.config');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios'); // for downloading the webhook buildUrl

class AppReleasesController {
  constructor({ appReleasesService }) {
    this.appReleasesSvc = appReleasesService;
  }

  checkUpdateKey(req) {
    if (!config.APP_UPDATE_UPLOAD_KEY) return;
    const key = req.get('x-update-key');
    if (!key || key !== config.APP_UPDATE_UPLOAD_KEY) {
      throw createError('Invalid update key', 401);
    }
  }

  getManifest = async (req, res, next) => {
    try {
      const track = req.query.track || 'production';
      const manifest = await this.appReleasesSvc.getManifest(track);
      
      // Rewrite the URL to point to our JIT proxy
      if (manifest && manifest.android && manifest.android.url) {
        manifest.android.url = `${req.protocol}://${req.get('host')}/api/v1/app-releases/android/download?track=${track}`;
      }
      
      res.json(apiResponse(manifest, 'App update manifest fetched successfully'));
    } catch (error) {
      next(error);
    }
  };

    /**
   * GET /api/v1/app-releases/android/download
   * JIT Handshake intercept. Redirects to CloudFront on success.
   */
  downloadApk = async (req, res, next) => {
    try {
      const track = req.query.track || 'production';
      const realUrl = await this.appReleasesSvc.verifyDownload(track);
      if (!realUrl) {
        return res.status(404).send('Update not found or corrupted.');
      }
      // Redirect seamlessly to the fast CloudFront CDN
      res.redirect(302, realUrl);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/app-releases/android/upload
   * Local upload script handler. Expects a multipart/form-data 'apk' file.
   */
  uploadApk = async (req, res, next) => {
    try {
      this.checkUpdateKey(req);
      
      const apkFile = req.files?.apk;
      if (!apkFile) {
        throw createError('No APK file uploaded', 400);
      }
      
      // Save buffer to a temp file for processing
      const tempFilePath = path.join(os.tmpdir(), `upload-${Date.now()}.apk`);
      if (apkFile.mv) {
        await apkFile.mv(tempFilePath); // express-fileupload
      } else {
        fs.writeFileSync(tempFilePath, apkFile.data); // fallback
      }

      const track = req.query.track || 'production';
      const result = await this.appReleasesSvc.processApk(tempFilePath, track);
      res.json(apiResponse(result, 'APK uploaded and processed successfully'));
    } catch (error) {
      console.error('[AppReleasesController] Upload failed:', error);
      // Return 200 even on error to prevent Expo from retrying
      res.status(200).send(`Upload handled with internal errors: ${error.message}`);
    }
  };
}

module.exports = AppReleasesController;
