'use strict';

const { Worker } = require('bullmq');

const redis = require('../../config/redis');
const { emitNotification } = require('../../sockets/notification.socket');


async function emitNotificationBatch(data) {
  try {
  const { batchKey } = data;

  const batch = await redis.hgetall(batchKey);
console.log("batch", batch)
  // const users = await userRepo.getUsers(senderIds);
  
  if (!batch) {
    return;
  }
  const senderIds = await this.redisClient.smembers(`${batchKey}:actors`);
  
  // Build final message
  const senderCount = senderIds.length;

  let message = `${senderCount} liked your post`


  // Socket
  emitNotification(batch.recipientId, message);
  } catch (error) {
    throw error
  }

}

module.exports = emitNotificationBatch;