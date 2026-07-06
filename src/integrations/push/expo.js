'use strict';

const { Expo } = require('expo-server-sdk');
const expo = new Expo();

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
      receipts.push(...ticketChunk);
    } catch (err) {
      receipts.push({ error: err.message });
    }
  }

  return receipts;
};

module.exports = { sendPush };
