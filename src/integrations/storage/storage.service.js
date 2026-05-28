'use strict';

const { PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { s3Client, BUCKET_NAME, CLOUDFRONT_DOMAIN } = require('../../config/s3');

// Generates a unique S3 object key.
const generateS3Key = (folder, userId, mimeType) => {
  const ext = mimeType.split('/')[1] || 'bin';
  return `${folder}/${userId}/${uuidv4()}.${ext}`;
};

// Returns a pre-signed S3 PUT URL valid for 5 minutes.
const getSignedUploadUrl = async (s3Key, mimeType, fileSizeBytes) => {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    ContentType: mimeType,
    ContentLength: fileSizeBytes,
  });
  return getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 min
};

// Verifies the file was actually uploaded by pinging S3 HEAD.
// Returns the CloudFront CDN URL.
const confirmUpload = async (s3Key) => {
  const command = new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key });
  await s3Client.send(command); // throws if not found
  return `${CLOUDFRONT_DOMAIN}/${s3Key}`;
};

// Permanently deletes an S3 object
const deleteFile = async (s3Key) => {
  const command = new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key });
  await s3Client.send(command);
};

module.exports = { generateS3Key, getSignedUploadUrl, confirmUpload, deleteFile };
