'use strict';

const { createError } = require('../utils/error.util');
const { uploadFile, deleteFile } = require('../integrations/storage/cloudinary.service');

const ALLOWED_FOLDERS = ['avatars', 'banners', 'posts', 'communities', 'events'];
const MAX_IMAGE_BYTES = parseInt(process.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024;
const MAX_VIDEO_BYTES = parseInt(process.env.MAX_VIDEO_SIZE_MB || '500') * 1024 * 1024;

class HighlightService {
  constructor({ highlightRepository }) {
    this.highlightRepo = highlightRepository;
  }

  async getSpotligth({limit, offset}) {
    try {
      const {spotligth, total} = await this.highlightRepo.getSpotLight(limit, offset);
      
      return {spotligth, total}
    } catch (error) {
      throw error;
    }
  }
}

module.exports = HighlightService;
