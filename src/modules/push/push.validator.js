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
  userId: z.string().uuid({message: "userId is invalied"}), 
  title: z.string({message: "Platform must be a string"}).min(1, { message: "Platform cannot be empty" }),
  message: z.string({message: "Title must be a string"}).min(1, { message: "Title cannot be empty" }),
  data: z.preprocess(typeCheck, z.record(z.unknown()))
}).strict();


const paginationQuerySchema = z.object({
  page: z.coerce
    .number({ invalid_type_error: "Page must be a number" })
    .int()
    .positive()
    .default(1).optional(),

  limit: z.coerce
    .number({ invalid_type_error: "Limit must be a number" })
    .int()
    .positive()
    .max(100, "Maximum limit allowed is 100")
    .default(10).optional(),
}).strict();


module.exports = {
  paginationQuerySchema,
  registerSchema,
  toggleNotificationSchema,
  sendSchema,
};
