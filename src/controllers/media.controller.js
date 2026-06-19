'use strict';

const { getPaginationParams, paginationMeta } = require('../utils/pagination.util');
const { apiResponse } = require('../utils/response.util');

class MediaController {
  constructor({ mediaService }) {
    this.mediaSvc = mediaService;
  }

  getSignedUrl = async (req, res, next) => {
    try {
      const userId = req.userId;
      const body = req.body;
      const result = await this.mediaSvc.getImageSignedUrl({userId, body});
      res.json(apiResponse(result, 'Signed URL generated'));
    } catch (error) {
      next(error);
    }
  };

  confirmUpload = async (req, res, next) => {
    try {
      const { mediaId, s3Key } = req.body;
      const result = await this.mediaSvc.confirmImageUpload({mediaId, s3Key});
      res.json(apiResponse(result, 'Upload confirmed'));
    } catch (error) {
      next(error);
    }
  };

  getVideoUploadUrl = async (req, res, next) => {
    try {
      const userId = req.userId;
      const body = req.body;
      const result = await this.mediaSvc.getVideoUploadUrl({userId, body});
      res.json(apiResponse(result, 'Video upload URL generated'));
    } catch (error) {
      next(error);
    }
  };

  getMediaStatus = async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await this.mediaSvc.getMediaStatus({id});
      res.json(apiResponse(result));
    } catch (error) {
      next(error);
    }
  };

  uploadImage = async (req, res, next) => {
    try {
      const userId = req.userId;
      const folder = req.body?.folder || null;
      const mediaFiles = req.files ? req.files.media : null;
      const result = await this.mediaSvc.uploadImage({userId, folder, mediaFiles});
      res.status(201).json(apiResponse(result, "File uploaded successfully!!"));
    } catch (error) {
      next(error);
    }
  };

  getMedia = async(req, res, next) => {
    try {
      const userId = req.userId
      const { limit, offset, page } = getPaginationParams(req.query);
      const {media, total} = await this.mediaSvc.getMedia({userId, limit, offset})
      res.json(apiResponse(media, "Media fetched successfully!!", paginationMeta(total, page, limit)));
    } catch (error) {
      throw error
    }
  }

  deleteMedia = async (req, res, next) => {
    try {
      const userId = req.userId;
      const {mediaId} = req.params;
      const result = await this.mediaSvc.deleteMedia({userId, mediaId});
      res.json(apiResponse(null, "Media deleted uccessfully!!"));
    } catch (error) {
      next(error)
    }
  }
}

module.exports = MediaController;
