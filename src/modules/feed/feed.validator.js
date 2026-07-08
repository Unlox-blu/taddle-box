'use strict';

const { z } = require('zod');

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
};
