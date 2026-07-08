'use strict';

const { z } = require('zod');
const config = require('../../config/app.config')

const notificationIdParamsSchema = z.object({
  notificationId: z.string().uuid({message: "Invalid NotificationId"})
}).strict();

const paginationQuerySchema = z.object({
  // Converts string to number, ensures it is a positive integer, defaults to 1 if missing
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
  paginationQuerySchema, notificationIdParamsSchema,
};
