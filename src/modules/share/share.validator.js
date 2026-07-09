'use strict';

const { z } = require('zod');


const postIdParamSchema = z.object({
  postId: z.string().uuid({message: "Invalied post Id"})
}).strict();

const profileIdParamSchema = z.object({
  profileId: z.string().uuid({message: "Invalied profile Id"})
}).strict();

const eventIdParamSchema = z.object({
  eventId: z.string().uuid({message: "Invalied event Id"})
}).strict();

const communityIdParamSchema = z.object({
  communityId: z.string().uuid({message: "Invalied community Id"})
}).strict();


module.exports = { postIdParamSchema, profileIdParamSchema, eventIdParamSchema, communityIdParamSchema };
