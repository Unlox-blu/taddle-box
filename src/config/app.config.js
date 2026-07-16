'use strict';

// Validates and exports all environment variables.
const required = (key) => {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
  return process.env[key];
};

const optional = (key, defaultValue = '') => process.env[key] || defaultValue;

module.exports = {
  // App
  NODE_ENV: optional('NODE_ENV', 'development'),
  PORT: parseInt(optional('PORT', '8080'), 10),
  BASE_URL: optional('BASE_URL', 'http://localhost:8080'),
  FRONTEND_URL: optional('FRONTEND_URL', 'http://localhost:3000'),
  ALLOWED_ORIGINS: optional('ALLOWED_ORIGINS', 'http://localhost:3000').split(','),

  // Database
  DB: {
    host: optional('DB_HOST', 'localhost'),
    port: parseInt(optional('DB_PORT', '5432'), 10),
    user: optional('DB_USER', 'postgres'),
    password: optional('DB_PASSWORD', ''),
    database: optional('DB_NAME', 'taddle_box_dev'),
    max: parseInt(optional('DB_MAX_CONNECTIONS', '20'), 10),
    ssl: optional('DB_SSL', 'false') === 'true',
    connectionString: optional('DB_CONNECTION_STRING')
  },

  // Redis
  REDIS_URL: optional('REDIS_URL', 'redis://localhost:6379'),

  // JWT
  ACCESS_TOKEN_SECRET: required('ACCESS_TOKEN_SECRET'),
  ACCESS_TOKEN_EXPIRES_IN: optional('ACCESS_TOKEN_EXPIRES_IN', '15m'),
  REFRESH_TOKEN_SECRET: required('REFRESH_TOKEN_SECRET'),
  REFRESH_TOKEN_EXPIRES_IN: optional('REFRESH_TOKEN_EXPIRES_IN', '7d'),
  VERIFICATION_TOKEN_SECRET: required('VERIFICATION_TOKEN_SECRET'),
  VERIFICATION_TOKEN_EXPIRES_IN: optional('VERIFICATION_TOKEN_EXPIRES_IN', '7d'),
  EMAIL_VERIFY_TOKEN_SECRET: required('EMAIL_VERIFY_TOKEN_SECRET'),
  EMAIL_VERIFY_TOKEN_EXPIRES_IN: optional('EMAIL_VERIFY_TOKEN_EXPIRES_IN', '24h'),
  PASSWORD_RESET_TOKEN_SECRET: required('PASSWORD_RESET_TOKEN_SECRET'),
  PASSWORD_RESET_TOKEN_EXPIRES_IN: optional('PASSWORD_RESET_TOKEN_EXPIRES_IN', '1h'),

  // Security
  BCRYPT_ROUNDS: optional('BCRYPT_ROUNDS'),

  //Session Management
  ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS: optional('ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS'),
  REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS: optional('REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS'),
  OTP_EXPIRES_IN: optional('OTP_EXPIRES_IN'),
  VALIDATE_OTP_VERIFICATION: optional('VALIDATE_OTP_VERIFICATION'),
  
  // Cloudinary
  CLOUDINARY_CLOUD_NAME: optional('CLOUDINARY_CLOUD_NAME'),
  CLOUDINARY_API_KEY: optional('CLOUDINARY_API_KEY'),
  CLOUDINARY_API_SECRET: optional('CLOUDINARY_API_SECRET'),

  // AWS S3
  AWS_ACCESS_KEY_ID: optional('AWS_ACCESS_KEY_ID'),
  AWS_SECRET_ACCESS_KEY: optional('AWS_SECRET_ACCESS_KEY'),
  AWS_REGION: optional('AWS_REGION', 'ap-south-1'),
  S3_BUCKET_NAME: optional('S3_BUCKET_NAME'),
  CLOUDFRONT_DOMAIN: optional('CLOUDFRONT_DOMAIN'),

  // Vimeo
  VIMEO_CLIENT_ID: optional('VIMEO_CLIENT_ID'),
  VIMEO_CLIENT_SECRET: optional('VIMEO_CLIENT_SECRET'),
  VIMEO_ACCESS_TOKEN: optional('VIMEO_ACCESS_TOKEN'),
  VIMEO_WEBHOOK_SECRET: optional('VIMEO_WEBHOOK_SECRET'),

  // Razorpay
  RAZORPAY_KEY_ID: optional('RAZORPAY_KEY_ID'),
  RAZORPAY_KEY_SECRET: optional('RAZORPAY_KEY_SECRET'),
  RAZORPAY_WEBHOOK_SECRET: optional('RAZORPAY_WEBHOOK_SECRET'),

  // Google OAuth
  GOOGLE_CLIENT_ID: optional('GOOGLE_CLIENT_ID'),

  // Email
  EMAIL: {
    host: optional('EMAIL_HOST', 'smtp.ethereal.email'),
    port: parseInt(optional('EMAIL_PORT', '587'), 10),
    user: optional('EMAIL_USER'),
    pass: optional('EMAIL_PASS'),
    from: optional('EMAIL_FROM', 'noreply@taddlebox.com'),
    fromName: optional('EMAIL_FROM_NAME', 'taddlebox'),
  },

  // Limits
  MAX_FILE_SIZE_MB: parseInt(optional('MAX_FILE_SIZE_MB', '10'), 10),
  MAX_VIDEO_SIZE_MB: parseInt(optional('MAX_VIDEO_SIZE_MB', '500'), 10),
  FEED_LIMIT: parseInt(optional('FEED_LIMIT', '20'), 10),
  MIN_AGE_LIMIT: parseInt(optional('MIN_AGE_LIMIT', '13'), 10),
};
