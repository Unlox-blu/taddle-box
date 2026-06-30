'use strict';

const { logger } = require('../../../middlewares/logger.middleware');
const EmailService = require('../../../integrations/email/email.service');

const emailJobProcessor = async (job) => {
      logger.info(`[EmailWorker] Processing job: ${job.name}`, { id: job.id });

      switch (job.name) {
        case 'otp-verification':
          await EmailService.sendOtpVerificationEmail(job.data.to, job.data.otp);
          break;
        case 'verification':
          await EmailService.sendVerificationEmail(job.data.to, job.data.name, job.data.token);
          break;
        case 'password_reset':
          await EmailService.sendPasswordResetEmail(job.data.to, job.data.name, job.data.token);
          break;
        case 'success':
          await EmailService.sendSuccessEmail(job.data.to, job.data.name, job.data.title, job.data.successMessage);
          break;
        case 'welcome':
          await EmailService.sendWelcomeEmail(job.data.to, job.data.name);
          break;
        case 'welcome_back':
          await EmailService.sendWelcomeBackEmail(job.data.to, job.data.name);
          break;
        case 'event_registration_success':
          await EmailService.sendRegisterForEventEmail(job.data.to, job.data);
          break;
        case 'send_invitation_event':
          await EmailService.sendCalendarInviteEmail(job.data.to, job.data);
          break;
        default:
          logger.warn(`[EmailWorker] Unknown job type: ${job.name}`);
      }

      logger.info(`[EmailWorker] Job complete: ${job.name}`, { id: job.id });
    }

module.exports = emailJobProcessor