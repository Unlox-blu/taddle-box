'use strict';

const config = require('../config/app.config')
const { hashPassword, comparePassword } = require('../utils/password.util');
const {
  generateAccessToken,
  generateRefreshToken,
  generateRandomToken,
  hashToken,
  verifyRefreshToken,
} = require('../utils/token.util');
const { createError } = require('../utils/error.util');
const { tryCatch } = require('bullmq');
const { addEmailJob } = require('../jobs/queues/email.queue');

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
};

class AppConfigService {
  constructor({ appConfigRepository }) {
    this.appConfigRepo = appConfigRepository;
  }

  async getAppConfig() {
    try {
        return await this.appConfigRepo.findAppConfig()
    } catch (error) {
      throw error;
    }
  }
}

module.exports = AppConfigService;
