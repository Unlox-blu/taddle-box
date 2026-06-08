'use strict';

const streamifier = require('streamifier');
const cloudinary = require('cloudinary').v2;
const config = require('./app.config');

cloudinary.config({
  cloud_name: config.CLOUDINARY_CLOUD_NAME,
  api_key: config.CLOUDINARY_API_KEY,
  api_secret: config.CLOUDINARY_API_SECRET,
});

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
