'use strict';

const { logger } = require('../../middlewares/logger.middleware');
const { sendPush: sendViaExpo, pollReceipts } = require('./expo');
const sendViaFCM = require('./fcm');

/**
 * Sends push notifications to a list of device records, routing each through
 * the correct provider based on device.pushProvider.
 *
 * @param {Array} devices - Array of { pushToken, pushProvider, isActive, notificationsEnabled }
 * @param {string} title
 * @param {string} body
 * @param {object} data
 * @returns {Promise<Array>} Combined receipts from all providers.
 */
async function sendPushToMany(devices, title, body, data) {
  const buckets = { expo: [], fcm: [] };

  for (const d of devices) {
    if (!d.isActive || !d.notificationsEnabled) continue;
    if (!d.pushToken) continue;

    switch (d.pushProvider) {
      case 'expo':
        buckets.expo.push(d.pushToken);
        break;
      case 'fcm':
        buckets.fcm.push(d.pushToken);
        break;
      default:
        logger.warn('[PushNotification] Unsupported provider — skipping', {
          provider: d.pushProvider,
          token: d.pushToken,
        });
    }
  }

  const [expoResults, fcmResults] = await Promise.all([
    buckets.expo.length ? sendViaExpo(buckets.expo, title, body, data) : [],
    buckets.fcm.length ? sendViaFCM(buckets.fcm, title, body, data) : [],
  ]);

  return [...expoResults, ...fcmResults];
}

module.exports = { sendPushToMany, pollReceipts };
