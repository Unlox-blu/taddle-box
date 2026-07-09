'use strict';

const { z } = require('zod');


const creditOrdebitXPSchema = z.object({
  xp: z.number({ required_error: 'Amount is required' }),
  transactionType: z.enum(['earned', 'spent', 'bonus'], { errorMap: () => ({ message: 'Invalid gender' }) }),
  sourceType: z.string().min(1, { message: "Source type cannot be empty" }).max(25, { message: "Source type max 50 chars" })
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


module.exports = { paginationQuerySchema, creditOrdebitXPSchema };
