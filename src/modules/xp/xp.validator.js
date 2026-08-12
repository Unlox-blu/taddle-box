'use strict';

const { z } = require('zod');


const creditOrdebitXPSchema = z.object({
  xp: z.number({ required_error: 'Amount is required' }),
  transactionType: z.enum(['earned', 'spent', 'bonus'], { errorMap: () => ({ message: 'Invalid transaction type' }) }),
  sourceType: z.string().min(1, { message: 'Source type cannot be empty' }).max(50, { message: 'Source type must be at most 50 characters' })
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

  // Wallet search — server-side filter over the full XP history.
  q: z.string().optional(),
}).strict();


module.exports = { paginationQuerySchema, creditOrdebitXPSchema };
