'use strict';

const { z } = require('zod');


const creditOrdebitXPSchema = z.object({
  xp: z.number({ required_error: 'Amount is required' }),
  transactionType: z.enum(['earned', 'spent', 'bonus'], { errorMap: () => ({ message: 'Invalid gender' }) }),
  sourceType: z.string().min(1, { message: "Source type cannot be empty" }).max(25, { message: "Source type max 50 chars" })
}).strict();

module.exports = { creditOrdebitXPSchema };
