'use strict';

const path = require('path');
const fs = require('fs');
const transporter = require('../../config/nodemailer');
const config = require('../../config/app.config');

const TEMPLATES_DIR = path.join(__dirname, 'templates');

const BACKUP_RECIPIENT = config.BACKUP_RECIPIENT;

const loadTemplate = (filename, replacements) => {
  const html = fs.readFileSync(path.join(TEMPLATES_DIR, filename), 'utf8');
  return Object.entries(replacements).reduce(
    (tpl, [k, v]) => tpl.replaceAll(`{{${k}}}`, v), html
  );
};

const send = async ({ to, subject, html, attachments=[] }) => {
  await transporter.sendMail({
    from: `"${config.EMAIL.fromName}" <${config.EMAIL.from}>`,
    to, 
    subject, 
    html,
    attachments
  });
};

const sendOtpVerificationEmail = async (to, otp) => {
  const html = loadTemplate('send-otp.html', {otp});
  await send({ to, subject: `${otp} is yous Taddle-Box verification code`, html });
}

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

const sendSuccessEmail = async (to, name, title, successMessage) => {
  const html = loadTemplate('success-email.html', { name, title, successMessage });
  await send({ to, subject: `${successMessage}`, html });
};

const sendWelcomeEmail = async (to, name) => {
  const html = loadTemplate('welcome.html', { name, appUrl: config.FRONTEND_URL });
  await send({ to, subject: `Welcome to taddlebox, ${name}!`, html });
};

const sendWelcomeBackEmail = async (to, name) => {
  const html = loadTemplate('welcome-back.html', { name, appUrl: config.FRONTEND_URL });
  await send({ to, subject: `Welcome back taddler!, ${name}!`, html });
};

const sendRegisterForEventEmail = async (to, data) => {
  const { userName, eventName, eventDate, eventTime, eventLocation, eventUrl } = data
  const html = loadTemplate('event-registration-success.html', { userName, eventName, eventDate, eventTime, eventLocation, eventUrl });
  await send({ to, subject: `Registration for ${eventName}!`, html });
};

const sendCalendarInviteEmail = async (to, data) => {
  const { userName, eventName, eventDate, eventTime, eventLocation, eventUrl, attachments } = data
  const html = loadTemplate('calendar-invite.html', { userName, eventName, eventDate, eventTime, eventLocation, eventUrl });
  await send({ to, subject: `Event Registration Confirmed for event: ${eventName}!`, html,  attachments });
}


const sendBackupSuccessEmail = async (archivePath, sizeBytes) => {
  await send({
    to: BACKUP_RECIPIENT,
    subject: 'Taddle-Box database backup completed successfully',
    html: `<p>The database backup completed successfully.</p><p>Archive: ${path.basename(archivePath)} (${sizeBytes} bytes)</p>`,
    attachments: [{ filename: path.basename(archivePath), path: archivePath }]
  });
};

const sendBackupFailureEmail = async (errorMessage) => {
  await send({
    to: BACKUP_RECIPIENT,
    subject: 'Taddle-Box database backup failed',
    html: `<p>The database backup failed after all retry attempts.</p><p>Error: ${errorMessage}</p>`
  });
};

module.exports = { sendOtpVerificationEmail, sendVerificationEmail, sendPasswordResetEmail, sendSuccessEmail, sendWelcomeEmail, sendWelcomeBackEmail, sendRegisterForEventEmail, sendCalendarInviteEmail, sendBackupFailureEmail, sendBackupSuccessEmail };
