'use strict';

const { logger } = require('../../../middlewares/logger.middleware');
const emailJobProcessor = require('../email/email.jobprocessor');
const notificationJobProcessor = require('../notification/notification.jobprocessor');
const videoJobProcessor = require('../video/video.jobprocessor');
const smsJobProcessor = require('../sms/sms.jobprocessor');
const streakJobProcessor = require('../streak/streak.jobprocessor');

const jobProcessor = async (job) => {
      logger.info(`[JobWorker] Processing job: ${job.name}`, { id: job.id });
      const [jobType, jobName] = job.name.split(":")
      job.name = jobName
      
      switch (jobType) {
        case 'email':
          await emailJobProcessor(job);
          break;
        case 'notification':
          await notificationJobProcessor(job);
          break;
        case 'video':
          await videoJobProcessor(job);
          break;
        case 'sms':
          await smsJobProcessor(job);
          break;
        case 'streak':
          await streakJobProcessor(job);
          break;
        default:
          logger.warn(`[JobWorker] Unknown job type: ${job.name}`);
      }

      logger.info(`[JobWorker] Job complete: ${job.name}`, { id: job.id });
    }

module.exports = jobProcessor