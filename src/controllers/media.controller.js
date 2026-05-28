'use strict';

const { apiResponse } = require('../utils/response.util');

class MediaController {
  constructor({ mediaService }) {
    this.mediaSvc = mediaService;
  }

  getSignedUrl = async (req, res, next) => {
    try {
      const result = await this.mediaSvc.getImageSignedUrl(req.userId, req.body);
      res.json(apiResponse(result, 'Signed URL generated'));
    } catch (err) { next(err); }
  };

  confirmUpload = async (req, res, next) => {
    try {
      const result = await this.mediaSvc.confirmImageUpload(req.body.mediaId, req.body.s3Key);
      res.json(apiResponse(result, 'Upload confirmed'));
    } catch (err) { next(err); }
  };

  getVideoUploadUrl = async (req, res, next) => {
    try {
      const result = await this.mediaSvc.getVideoUploadUrl(req.userId, req.body);
      res.json(apiResponse(result, 'Video upload URL generated'));
    } catch (err) { next(err); }
  };

  getMediaStatus = async (req, res, next) => {
    try {
      const result = await this.mediaSvc.getMediaStatus(req.params.id);
      res.json(apiResponse(result));
    } catch (err) { next(err); }
  };
}

module.exports = MediaController;
