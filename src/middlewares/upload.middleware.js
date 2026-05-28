'use strict';

const multer = require('multer');
const { createError } = require('../utils/error.util');
const config = require('../config/app.config');

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];

const imageFilter = (_req, file, cb) => {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) cb(null, true);
  else cb(createError('Only image files are allowed (jpeg, png, webp, gif)', 400));
};

const videoFilter = (_req, file, cb) => {
  if (ALLOWED_VIDEO_TYPES.includes(file.mimetype)) cb(null, true);
  else cb(createError('Only video files are allowed (mp4, mov, avi, webm)', 400));
};

const storage = multer.memoryStorage();

/** Single image upload — max 10 MB */
const uploadSingle = (fieldName) =>
  multer({
    storage,
    fileFilter: imageFilter,
    limits: { fileSize: config.MAX_FILE_SIZE_MB * 1024 * 1024 },
  }).single(fieldName);

/** Multiple image uploads — max 10 MB each */
const uploadMultiple = (fieldName, maxCount = 5) =>
  multer({
    storage,
    fileFilter: imageFilter,
    limits: { fileSize: config.MAX_FILE_SIZE_MB * 1024 * 1024 },
  }).array(fieldName, maxCount);

/** Single video upload — max 500 MB */
const uploadVideo = (fieldName) =>
  multer({
    storage,
    fileFilter: videoFilter,
    limits: { fileSize: config.MAX_VIDEO_SIZE_MB * 1024 * 1024 },
  }).single(fieldName);

module.exports = { uploadSingle, uploadMultiple, uploadVideo };
