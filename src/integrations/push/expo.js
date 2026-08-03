'use strict';

const { Expo } = require('expo-server-sdk');
const expo = new Expo();

// Sends push notifications to the given Expo push tokens.
// Returns one result object per token so callers can prune dead tokens
// (e.g. DeviceNotRegistered) and surface per-device errors.
const sendPush = async (tokens, title, body, data = {}) => {
  if (!tokens || tokens.length === 0) return [];

  const messages = tokens.map((token) => ({
    to: token,
    sound: 'default',
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
          status: ticket.status,
          message: ticket.message || null,
          details: ticket.details || null,
        });
      });
    } catch (err) {
      // Whole chunk failed — attribute the error to each token so the caller
      // can decide whether to retry or drop them.
      chunk.forEach((message) => {
        receipts.push({ token: message.to, status: 'error', message: err.message });
      });
    }
  }

  return receipts;
};

module.exports = { sendPush };
