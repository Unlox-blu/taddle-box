'use strict';

const apiResponse = (data = null, message = 'Success', meta = null) => ({
  success: true,
  message,
  data,
  ...(meta && { meta }),
  timestamp: new Date().toISOString(),
});

module.exports = { apiResponse };
