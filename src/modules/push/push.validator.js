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
  }


const registerSchema = z.object({
  token: z.string({message: "Token must be a string"}).min(1, { message: "Token cannot be empty" }),
  platform: z.string({message: "Platform must be a string"}).min(1, { message: "Platform cannot be empty" }),
}).strict();

const toggleNotificationSchema = z.object({
  token: z.string({message: "Token must be a string"}).min(1, { message: "Token cannot be empty" }),
}).strict();

const sendSchema = z.object({
  userId: z.string().uuid({ message: 'Invalid user ID format' }),
  title: z.string({ message: 'Title must be a string' }).min(1, { message: 'Title cannot be empty' }),
  message: z.string({ message: 'Message must be a string' }).min(1, { message: 'Message cannot be empty' }),
  data: z.preprocess(typeCheck, z.record(z.unknown()))
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
    .max(100, 'Maximum limit allowed is 100')
    .default(10).optional(),
}).strict();


module.exports = {
  paginationQuerySchema,
  registerSchema,
  toggleNotificationSchema,
  sendSchema,
};
