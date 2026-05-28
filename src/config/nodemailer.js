'use strict';

const nodemailer = require('nodemailer');
const config = require('./app.config');

const transporter = nodemailer.createTransport({
  host: config.EMAIL.host,
  port: config.EMAIL.port,
  secure: config.EMAIL.port === 465,
  auth: { user: config.EMAIL.user, pass: config.EMAIL.pass },
});

// Verify connection on startup (non-fatal in dev)
transporter.verify((err) => {
  if (err) console.warn('⚠️  Nodemailer connection failed:', err.message);
  else console.info('Nodemailer ready');
});

module.exports = transporter;
