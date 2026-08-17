'use strict';

const { z } = require('zod');
const config = require('../../config/app.config')


const userIdParamSchema  = z.object({
  userId: z.string().uuid({ message: "Invalid user ID format" }),
}).strict();

const activeStatusBatchBodySchema = z.object({
  userIds: z.array(z.string().uuid({ message: 'Invalid user ID format' })).max(50, 'Too many users').optional(),
}).strict();



module.exports = {
  userIdParamSchema,
  activeStatusBatchBodySchema,
};
