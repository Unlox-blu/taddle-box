'use strict';

const streamifier = require('streamifier');
const cloudinary = require('../../config/cloudinary');

const uploadFile = async (buffer, folder, userId) => {
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
};

const deleteFile = async (publicId) => {
  await cloudinary.uploader.destroy(publicId);
};

module.exports = { uploadFile, deleteFile};
