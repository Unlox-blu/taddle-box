'use strict';

const { z } = require('zod');


const postIdParamSchema = z.object({
  postId: z.string().uuid({ message: 'Invalid post ID format' })
}).strict();

const profileIdParamSchema = z.object({
  profileId: z.string().uuid({ message: 'Invalid profile ID format' })
}).strict();

const eventIdParamSchema = z.object({
  eventId: z.string().uuid({ message: 'Invalid event ID format' })
}).strict();

const communityIdParamSchema = z.object({
  communityId: z.string().uuid({ message: 'Invalid community ID format' })
}).strict();


module.exports = { postIdParamSchema, profileIdParamSchema, eventIdParamSchema, communityIdParamSchema };
