'use strict';

const { z } = require('zod');
const config = require('../../config/app.config')


const userIdParamSchema  = z.object({
  userId: z.string().uuid({ message: "Invalid user ID format" }),
}).strict();



module.exports = {
  userIdParamSchema,
};
