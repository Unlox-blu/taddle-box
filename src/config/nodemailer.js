'use strict';

const nodemailer = require('nodemailer');
const config = require('./app.config');
const { logger } = require('../middlewares/logger.middleware');

const transporter = nodemailer.createTransport({
  host: config.EMAIL.host,
  port: config.EMAIL.port,
  secure: config.EMAIL.port === 465,
  auth: { user: config.EMAIL.user, pass: config.EMAIL.pass },
});

// Verify connection on startup (non-fatal in dev)
transporter.verifyConnection = () => new Promise((resolve) => {
  transporter.verify((err) => {
    if (err) {
      logger.warn('⚠️  Nodemailer connection failed:', { error: err.message });
      resolve(false);
    } else {
      logger.info('Nodemailer ready');
      resolve(true);
    }
  });
});

module.exports = transporter;
