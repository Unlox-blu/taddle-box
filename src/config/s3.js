'use strict';

const { S3Client } = require('@aws-sdk/client-s3');
const config = require('./app.config');

const s3Client = new S3Client({
  region: config.AWS_REGION,
  credentials: {
    accessKeyId: config.AWS_ACCESS_KEY_ID,
    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = config.S3_BUCKET_NAME;
const CLOUDFRONT_DOMAIN = config.CLOUDFRONT_DOMAIN;

module.exports = { s3Client, BUCKET_NAME, CLOUDFRONT_DOMAIN };
