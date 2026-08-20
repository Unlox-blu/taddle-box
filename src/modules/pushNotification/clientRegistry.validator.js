'use strict';

const { z } = require('zod');

const typeCheck = (val) => {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
};

/**
 * POST /push-notification/register
 *
 * Registers or refreshes a device token.  The client must send a stable
 * deviceId (generated at install time) and a sessionId (generated on
 * app startup).
 */
const registerSchema = z.object({
  pushToken:    z.string().min(1).optional(),
  pushProvider: z.enum(['expo', 'fcm', 'apns', 'webpush']).default('expo').optional(),
  deviceId:     z.string().min(1).optional(),
  sessionId:    z.string().min(1).optional(),
  token:        z.string().min(1).optional(),
  platform:     z.string().min(1, { message: 'Platform is required' }),
  appVersion:   z.string().optional(),
  osVersion:    z.string().optional(),
}).strict().refine(
  (data) => data.pushToken || data.token,
  { message: 'Either pushToken or token is required' },
);

/**
 * POST /push-notification/togglenotification
 *
 * Toggles push notifications for a specific device/user pair.
 */
const toggleNotificationSchema = z.object({
  deviceId: z.string().min(1).optional(),
  token:    z.string().min(1).optional(),
}).strict().refine(
  (data) => data.deviceId || data.token,
  { message: 'Either deviceId or token is required' },
);

/**
 * POST /push-notification/send
 *
 * Sends a push notification (admin/internal use).
 */
const sendSchema = z.object({
  userId:  z.string().uuid({ message: 'Invalid user ID format' }),
  title:   z.string().min(1, { message: 'Title cannot be empty' }),
  message: z.string().min(1, { message: 'Message cannot be empty' }),
  data:    z.preprocess(typeCheck, z.record(z.unknown())),
}).strict();

/**
 * POST /push-notification/update-token
 *
 * Device-wide push token update with ownership verification.
 * Requires deviceId and pushToken.
 */
const updateDevicePushTokenSchema = z.object({
  deviceId:     z.string().min(1, { message: 'deviceId is required' }),
  pushToken:    z.string().min(1, { message: 'pushToken is required' }),
  pushProvider: z.enum(['expo', 'fcm', 'apns', 'webpush']).optional(),
}).strict();

const paginationQuerySchema = z.object({
  page: z.coerce
    .number({ invalid_type_error: 'Page must be a number' })
    .int({ message: 'Page must be an integer' })
    .positive({ message: 'Page must be greater than zero' })
    .default(1).optional(),
  limit: z.coerce
    .number({ invalid_type_error: 'Limit must be a number' })
    .int({ message: 'Limit must be an integer' })
    .positive({ message: 'Limit must be greater than zero' })
    .max(100, { message: 'Maximum limit is 100' })
    .default(10).optional(),
}).strict();

module.exports = {
  paginationQuerySchema,
  registerSchema,
  toggleNotificationSchema,
  sendSchema,
  updateDevicePushTokenSchema,
};
