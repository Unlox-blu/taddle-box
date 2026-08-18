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
  PORT: parseInt(optional('PORT', '1999'), 10),
  BASE_URL: optional('BASE_URL', 'http://localhost:1999'),
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
    connectionString: optional('DB_CONNECTION_STRING'),
  },

  // Redis
  REDIS_URL: optional('REDIS_URL', 'redis://localhost:6379'),

  // JWT
  TOKEN_SECRET: required('TOKEN_SECRET'),
  ACCESS_TOKEN_EXPIRES_IN: optional('ACCESS_TOKEN_EXPIRES_IN', '1d'),
  REFRESH_TOKEN_EXPIRES_IN: optional('REFRESH_TOKEN_EXPIRES_IN', '7d'),
  SOCIAL_TOKEN_EXPIRES_IN: optional('SOCIAL_TOKEN_EXPIRES_IN', '30m'),
  VERIFICATION_TOKEN_EXPIRES_IN: optional('VERIFICATION_TOKEN_EXPIRES_IN', '10m'),
  EMAIL_VERIFY_TOKEN_EXPIRES_IN: optional('EMAIL_VERIFY_TOKEN_EXPIRES_IN', '15m'),
  PASSWORD_RESET_TOKEN_EXPIRES_IN: optional('PASSWORD_RESET_TOKEN_EXPIRES_IN', '10m'),

  // Security
  BCRYPT_ROUNDS: optional('BCRYPT_ROUNDS'),

  //Session Management
  ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS: optional('ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS'),
  REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS: optional('REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS'),
  OTP_EXPIRES_IN: optional('OTP_EXPIRES_IN', '300000'),
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

  // PayU — credentials MUST come from .env (single source of truth). No test
  // credentials are hardcoded here; PAYU_KEY / PAYU_SALT are required so the
  // server refuses to start with a misconfigured checkout.
  PAYU_KEY: required('PAYU_KEY'),
  PAYU_SALT: required('PAYU_SALT'),
  PAYU_URL: optional('PAYU_URL', 'https://test.payu.in/_payment'),
  // Where PayU redirects the WebView after checkout. Defaults to BASE_URL but
  // can be overridden with the public tunnel/domain when testing on a device
  // (the phone's WebView can't reach a localhost backend).
  PAYU_RETURN_BASE_URL: optional('PAYU_RETURN_BASE_URL'),

  // Admin withdrawal handoff — the secure URL that receives the one-time token
  // when a user requests a payout. Must be set in production.
  WITHDRAWAL_ADMIN_BASE_URL: optional('WITHDRAWAL_ADMIN_BASE_URL', 'https://admin.taddlebox.com'),
  // Shared secret the admin backend sends in the X-Webhook-Secret header to
  // authorize withdrawal confirm/reject webhooks.
  WITHDRAWAL_WEBHOOK_SECRET: required('WITHDRAWAL_WEBHOOK_SECRET'),

  // Economy — XP conversion rate: how many XP are worth 1 Rupee. Used by
  // wallet conversions (XP <-> cash) and paid-event ticket pricing.
  XP_PER_RUPEE: parseInt(optional('XP_PER_RUPEE', '100'), 10),

  // Google OAuth
  GOOGLE_CLIENT_ID: optional('GOOGLE_CLIENT_ID'),

  // Apple Client Secret
  APPLE_TEAM_ID: optional('APPLE_TEAM_ID'),
  APPLE_SERVICE_ID: optional('APPLE_SERVICE_ID'),
  APPLE_KEY_ID: optional('APPLE_KEY_ID'),
  APPLE_P8_PATH: optional('APPLE_P8_PATH'),
  APPLE_P8_KEY: optional('APPLE_P8_KEY'),

  // Email
  EMAIL: {
    host: optional('EMAIL_HOST', 'smtp.ethereal.email'),
    port: parseInt(optional('EMAIL_PORT', '587'), 10),
    user: optional('EMAIL_USER'),
    pass: optional('EMAIL_PASS'),
    from: optional('EMAIL_FROM', 'noreply@taddlebox.com'),
    fromName: optional('EMAIL_FROM_NAME', 'taddlebox'),
  },

  // App update (APK release tool)
  // Optional shared secret for POST /api/v1/app-update/presign. When set, the
  // request must carry it in the X-Update-Key header. Unset → open (dev).
  APP_UPDATE_UPLOAD_KEY: optional('APP_UPDATE_UPLOAD_KEY'),

  // Limits
  MAX_FILE_SIZE_MB: parseInt(optional('MAX_FILE_SIZE_MB', '10'), 10),
  MAX_VIDEO_SIZE_MB: parseInt(optional('MAX_VIDEO_SIZE_MB', '500'), 10),
  FEED_LIMIT: parseInt(optional('FEED_LIMIT', '20'), 10),
  MIN_AGE_LIMIT: parseInt(optional('MIN_AGE_LIMIT', '13'), 10),
};
