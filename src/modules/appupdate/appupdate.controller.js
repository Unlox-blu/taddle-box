'use strict';

const { apiResponse } = require('../../utils/response.util');
const { createError } = require('../../utils/error.util');
const config = require('../../config/app.config');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios'); // for downloading the webhook buildUrl

class AppUpdateController {
  constructor({ appUpdateService }) {
    this.appUpdateSvc = appUpdateService;
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
      const manifest = await this.appUpdateSvc.getManifest();
      
      // Rewrite the URL to point to our JIT proxy
      if (manifest && manifest.android && manifest.android.url) {
        manifest.android.url = `${req.protocol}://${req.get('host')}/api/v1/app-update/download`;
      }
      
      res.json(apiResponse(manifest, 'App update manifest fetched successfully'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/app-update/download
   * JIT Handshake intercept. Redirects to CloudFront on success.
   */
  downloadApk = async (req, res, next) => {
    try {
      const realUrl = await this.appUpdateSvc.verifyDownload();
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
   * POST /api/v1/app-update/upload
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

      const result = await this.appUpdateSvc.processApk(tempFilePath);
      res.json(apiResponse(result, 'APK uploaded and processed successfully'));
    } catch (error) {
      // Return 200 even on error to prevent Expo from retrying
      res.status(200).send('Upload handled with internal errors');
    }
  };
}

module.exports = AppUpdateController;
