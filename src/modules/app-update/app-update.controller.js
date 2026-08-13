'use strict';

const { apiResponse } = require('../../utils/response.util');
const { createError } = require('../../utils/error.util');
const config = require('../../config/app.config');

class AppUpdateController {
  constructor({ appUpdateService }) {
    this.appUpdateSvc = appUpdateService;
  }

  /**
   * Guards the write endpoints. When APP_UPDATE_UPLOAD_KEY is configured, the
   * X-Update-Key header must match. Throws 401 otherwise.
   */
  checkUpdateKey(req) {
    if (!config.APP_UPDATE_UPLOAD_KEY) return;
    const key = req.get('x-update-key');
    if (!key || key !== config.APP_UPDATE_UPLOAD_KEY) {
      throw createError('Invalid update key', 401);
    }
  }

  getManifest = async (req, res, next) => {
    try {
      const manifest = this.appUpdateSvc.getManifest();
      res.json(apiResponse(manifest, 'App update manifest fetched successfully'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/app-update/presign  { fileName }
   * → { uploadUrl, s3Key, finalUrl } for the release tool (publish:update:direct).
   */
  getUploadUrl = async (req, res, next) => {
    try {
      this.checkUpdateKey(req);
      const { fileName } = req.body || {};
      const result = await this.appUpdateSvc.getPresignedUploadUrl({ fileName });
      res.json(apiResponse(result, 'Upload URL generated'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/app-update/delete  { fileName }
   * Deletes an APK from the apks/ S3 folder (used to prune the previous build).
   */
  deleteApk = async (req, res, next) => {
    try {
      this.checkUpdateKey(req);
      const { fileName } = req.body || {};
      const result = await this.appUpdateSvc.deleteApk({ fileName });
      res.json(apiResponse(result, 'APK deleted'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = AppUpdateController;
