'use strict';

const path = require('path');
const fs = require('fs');
const transporter = require('../../config/nodemailer');
const config = require('../../config/app.config');

const TEMPLATES_DIR = path.join(__dirname, 'templates');

const loadTemplate = (filename, replacements) => {
  const html = fs.readFileSync(path.join(TEMPLATES_DIR, filename), 'utf8');
  return Object.entries(replacements).reduce(
    (tpl, [k, v]) => tpl.replaceAll(`{{${k}}}`, v), html
  );
};

const send = async ({ to, subject, html }) => {
  await transporter.sendMail({
    from: `"${config.EMAIL.fromName}" <${config.EMAIL.from}>`,
    to, subject, html,
  });
};

const sendVerificationEmail = async (to, name, token) => {
  const verifyUrl = `${config.FRONTEND_URL}/verify-email/${token}`;
  const html = loadTemplate('verify-email.html', { name, verifyUrl });
  await send({ to, subject: 'Verify your taddlebox email', html });
};

const sendPasswordResetEmail = async (to, name, token) => {
  const resetUrl = `${config.FRONTEND_URL}/reset-password/${token}`;
  const html = loadTemplate('reset-password.html', { name, resetUrl });
  await send({ to, subject: 'Reset your taddlebox password', html });
};

const sendWelcomeEmail = async (to, name) => {
  const html = loadTemplate('welcome.html', { name, appUrl: config.FRONTEND_URL });
  await send({ to, subject: `Welcome to taddlebox, ${name}!`, html });
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail };
