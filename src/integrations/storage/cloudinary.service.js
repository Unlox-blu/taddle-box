'use strict';

const streamifier = require('streamifier');
const cloudinary = require('../../config/cloudinary');
const { createError } = require('../../utils/error.util');

const uploadFile = async (buffer, folder, userId) => {
  try {
    const response = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: `${userId}-${Date.now()}`,
        resource_type: 'auto',
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    streamifier.createReadStream(buffer).pipe(stream);
  });

  return {
    publicId: response.public_id,
    url: response.secure_url,
  };
  } catch (error) {
    throw createError(`UploadFile Error: ${error.message}`, 500)
  }
};

const deleteFile = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    throw createError(`DeleteFile Error: ${error.message}`, 500)
  }
};

module.exports = { uploadFile, deleteFile};
