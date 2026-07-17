'use strict';

const { z } = require('zod');

// Min ₹1 (100 paise), Max ₹10,000 (1,000,000 paise)
const topupSchema = z.object({
  amountCents: z
    .number({ required_error: 'Amount is required' })
    .int('Amount must be a whole number')
    .min(100, 'Minimum top-up is ₹1')
    .max(1000000, 'Maximum top-up is ₹10,000'),
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

module.exports = { paginationQuerySchema, topupSchema };
