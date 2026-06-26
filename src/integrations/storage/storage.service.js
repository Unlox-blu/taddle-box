'use strict';

const { PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { s3Client, BUCKET_NAME, CLOUDFRONT_DOMAIN } = require('../../config/s3');


const generateS3Key = (folder, userId, mimeType) => {
  const ext = mimeType.split('/')[1] || 'bin';
  return `${folder}/${userId}/${uuidv4()}.${ext}`;
};


const getSignedUploadUrl = (s3Key, mimeType, fileSizeBytes) => {

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    ContentType: mimeType,
    ContentLength: fileSizeBytes,
  });
  return getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 min
};



const confirmUpload = async (s3Key) => {
  try {
    const command = new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key });
    await s3Client.send(command); 
    return `${CLOUDFRONT_DOMAIN}/${s3Key}`;
  } catch (error) {
    throw error
  }
};


const deleteFile = async (s3Key) => {
  try {
    const command = new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key });
    await s3Client.send(command);
  } catch (error) {
    throw error
  }
};

const getBucketFiles = async () => {
  try {
  const res = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
    })
    );

  return res.Contents;
  } catch (error) {
    throw error
  }
}

module.exports = { generateS3Key, getSignedUploadUrl, confirmUpload, deleteFile, getBucketFiles };
