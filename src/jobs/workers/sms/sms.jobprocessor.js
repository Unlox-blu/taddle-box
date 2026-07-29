const { sendWhatsappOtp } = require('../../../integrations/sms/aisensy.service');
const { logger } = require('../../../middlewares/logger.middleware');

const smsJobProcessor = async (job) => {
  if (job.name === 'otp-verification') {
    const { to, otp } = job.data;
    logger.info('[JobWorker] Processing SMS OTP verification', { to });
    
    // Send via AiSensy WhatsApp
    await sendWhatsappOtp(to, otp);
  } else {
    logger.warn(`[JobWorker] Unknown SMS job name: ${job.name}`);
  }
};

module.exports = smsJobProcessor;
