'use strict';

const { z } = require('zod');
const config = require('../../config/app.config')

const ALLOWED_MODE = ['BOT', 'QUICK', 'TOURNAMENT', 'CUSTOM']
const DIFFICULTY_TYPE = ['easy', 'medium', 'hard']
const RESULT_TYPE = ['WIN', 'LOSS', 'DRAW']

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

const gameIdParamSchema  = z.object({
  gameId: z.string().uuid({ message: "Invalid game ID format" }),
}).strict();

const matchIdParamSchema  = z.object({
  matchId: z.string().uuid({ message: "Invalid match ID format" }),
}).strict();

const searchSchema = z.object({
  query: z.string().default(''),
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

const paginationSchema = z.object({
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


const createMatchSchema = z.object({
  gameId: z.string().uuid({ message: 'Invalid game ID format' }),
  mode : z.enum(ALLOWED_MODE, {
            error_map: () => ({ message: `Mode must be one of: ${ALLOWED_MODE.join(', ')}` })
          }),
  category: z.string().optional(),
  difficulty: z.enum(DIFFICULTY_TYPE, {
            error_map: () => ({ message: `Difficulty must be one of: ${DIFFICULTY_TYPE.join(', ')}` })
          }).optional(),
  metadata: z.preprocess(typeCheck, z.record(z.any())).optional()
})

const updateMatchSchema = z.object({
  matchId: z.string().uuid({ message: 'Invalid match ID format' }),
  result : z.enum(RESULT_TYPE, {
            error_map: () => ({ message: `Result must be one of: ${RESULT_TYPE.join(', ')}` })
          }),
  score: z.number().nonnegative({ message: "Score cannot be negative" }),
  duration: z.number().nonnegative({ message: "Duration cannot be negative" }),
  xpEarned: z.number().nonnegative({ message: "xpEarned cannot be negative" }),
})

module.exports = {
  gameIdParamSchema,
  matchIdParamSchema,
  searchSchema,
  paginationSchema,
  createMatchSchema,
  updateMatchSchema,
};
