'use strict';

const { apiResponse } = require('../utils/response.util');

class MediaController {
  constructor({ mediaService }) {
    this.mediaSvc = mediaService;
  }

  getSignedUrl = async (req, res, next) => {
    try {
      const userId = req.userId;
      const body = req.body;
      const result = await this.mediaSvc.getImageSignedUrl(userId, body);
      res.json(apiResponse(result, 'Signed URL generated'));
    } catch (err) {
      next(err);
    }
  };

  confirmUpload = async (req, res, next) => {
    try {
      const { mediaId, s3Key } = req.body;
      const result = await this.mediaSvc.confirmImageUpload(mediaId, s3Key);
      res.json(apiResponse(result, 'Upload confirmed'));
    } catch (err) {
      next(err);
    }
  };

  getVideoUploadUrl = async (req, res, next) => {
    try {
      const userId = req.userId;
      const body = req.body;
      const result = await this.mediaSvc.getVideoUploadUrl(userId, body);
      res.json(apiResponse(result, 'Video upload URL generated'));
    } catch (err) {
      next(err);
    }
  };

  getMediaStatus = async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await this.mediaSvc.getMediaStatus(id);
      res.json(apiResponse(result));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = MediaController;
