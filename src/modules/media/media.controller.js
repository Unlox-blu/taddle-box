'use strict';

const { getPaginationParams, paginationMeta } = require('../../utils/pagination.util');
const { apiResponse } = require('../../utils/response.util');

class MediaController {
  constructor({ mediaService }) {
    this.mediaSvc = mediaService;
  }

  getSignedUrl = async (req, res, next) => {
    try {
      const userId = req.userId;
      const mediaData = req.body;
      const file = req.files
      const result = await this.mediaSvc.getImageSignedUrl({userId, mediaData});
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

  cancleImageUpload = async(req, res, next) => {
    try {
      const userId = req.userId
      const {mediaId} = req.params;
      await this.mediaSvc.cancleImageUpload({userId, mediaId})
      res.json(apiResponse(null, "Cancle upload successfully!!"));
    } catch (error) {
      throw error
    }
  }


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
      const { mediaId } = req.params;
      const result = await this.mediaSvc.getMediaStatus({mediaId});
      res.json(apiResponse(result));
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




  // temporary for development 
  gets3Uploaded = async (req, res, next) => {
    try {
      const result = await this.mediaSvc.gets3Uploaded();
      res.json(apiResponse(result, "Media deleted uccessfully!!"));
    } catch (error) {
      next(error)
    }
  }
}

module.exports = MediaController;
