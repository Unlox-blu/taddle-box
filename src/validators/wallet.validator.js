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

module.exports = { topupSchema };
