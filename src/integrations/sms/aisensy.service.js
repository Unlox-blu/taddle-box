const axios = require('axios');
const { logger } = require('../../middlewares/logger.middleware');

const sendWhatsappOtp = async (phonenumber, otp) => {
  if (!phonenumber || !otp) {
    logger.error('[AiSensy] Missing input for WhatsApp OTP message');
    return null;
  }

  try {
    const apiKey =
      process.env.AISENSY_API_KEY ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4YTg3YWFhYTU5MGE2N2JmNzg0YmY0MiIsIm5hbWUiOiJVbmxveCBDb25maXJtYXRpb25zIiwiYXBwTmFtZSI6IkFpU2Vuc3kiLCJjbGllbnRJZCI6IjY4NzhmNTJlOTFlYzU4MGMwZWRmYTUyMyIsImFjdGl2ZVBsYW4iOiJGUkVFX0ZPUkVWRVIiLCJpYXQiOjE3NTU4NzE5MTR9.l-Sj2uGzNEygBgekupTUDrxHZ5uMAj9RY48uZVklCNk';

    // Clean phone number (remove +, spaces, dashes)
    let cleanPhone = phonenumber.replace(/[\+\-\s]/g, '');

    const templateParams = [
      'Taddler', // student_name
      'Taddle Box', // course_name
      'Taddler', // student_name (again)
      'support@taddlebox.com', // email
      cleanPhone, // phonenumber
      'Taddle Box OTP', // course_name (again)
      'Below is the OTP Code', // course_type
      otp.toString(), // batch (mapped to OTP)
    ];

    const message_res = await axios.post('https://backend.aisensy.com/campaign/t1/api/v2', {
      apiKey,
      campaignName: process.env.AISENSY_OTP_CAMPAIGN_NAME || 'Confirmations', // Replace with your exact campaign name
      destination: cleanPhone.startsWith('91') ? cleanPhone : '91' + cleanPhone,
      userName: 'Taddler', // Can be customized if we pass user details
      media: {
        url: 'https://www.taddlebox.com',
        filename: 'OTP',
      },
      templateParams: templateParams,
    });

    logger.info(
      `[AiSensy] OTP sent successfully via WhatsApp: ${JSON.stringify(message_res.data)}`
    );
    return message_res.data;
  } catch (err) {
    const errorDetails = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    logger.error(`[AiSensy] Error sending WhatsApp OTP: ${errorDetails}`);
    console.error('[AiSensy] Full Error:', err.response?.data || err.message);
    return null;
  }
};

module.exports = { sendWhatsappOtp };
