'use strict';

const { Expo } = require('expo-server-sdk');
const { logger } = require('../../middlewares/logger.middleware');
const expo = new Expo();

// Sends push notifications to the given Expo push tokens.
// Returns one result object per token so callers can prune dead tokens
// (e.g. DeviceNotRegistered) and surface per-device errors.
//
// Each result now includes a `ticketId` field — store it and pass it to
// pollReceipts() later to learn the *final* delivery status (RateLimited,
// DeviceNotRegistered on the device side, etc.).
const sendPush = async (tokens, title, body, data = {}) => {
  if (!tokens || tokens.length === 0) return [];

  // Android 8+ requires a channelId — without it, notifications are silently
  // dropped.  The Expo push service maps an explicit channelId to the channel
  // of the same name that ensureAndroidChannel() creates on the device.
  const messages = tokens.map((token) => ({
    to: token,
    sound: 'default',
    channelId: 'default',
    title,
    body,
    data,
  }));

  const receipts = [];
  const chunks = expo.chunkPushNotifications(messages);

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      ticketChunk.forEach((ticket, index) => {
        receipts.push({
          token: chunk[index]?.to || null,
          ticketId: ticket.id || null,
          status: ticket.status,
          message: ticket.message || null,
          details: ticket.details || null,
        });
      });
    } catch (err) {
      // Whole chunk failed — attribute the error to each token so the caller
      // can decide whether to retry or drop them.
      chunk.forEach((message) => {
        receipts.push({ token: message.to, ticketId: null, status: 'error', message: err.message });
      });
    }
  }

  return receipts;
};

// ── Receipt polling ──────────────────────────────────────────────────────────
// Expo's ticket response tells you if the message was *accepted* by the push
// service.  Receipts tell you the *final* delivery status — whether the
// device actually received it, whether it was rate-limited, etc.
//
// Call this ~30–60 s after sendPush to catch delayed failures that the
// initial ticket response couldn't report.
const pollReceipts = async (receiptIds) => {
  if (!receiptIds || receiptIds.length === 0) return {};

  const receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds);
  const allReceipts = {};

  for (const chunk of receiptIdChunks) {
    try {
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
      Object.assign(allReceipts, receipts);
    } catch (err) {
      logger.error('[PushNotificationReceipt] Failed to poll receipts', { error: err.message });
    }
  }

  return allReceipts;
};

module.exports = { sendPush, pollReceipts };
