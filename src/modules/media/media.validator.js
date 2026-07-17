'use strict';

const { z } = require('zod');

const ALLOWED_FOLDERS = ['avatars', 'banners', 'posts', 'communities', 'events'];
const MAX_IMAGE_BYTES = parseInt(process.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024;

const getSignedUrlSchema = z.object({
  folder: z.enum(ALLOWED_FOLDERS, {
    error_map: () => ({ message: `Folder must be one of: ${ALLOWED_FOLDERS.join(', ')}` })
  }),
  postId: z.string().uuid({ message: 'Invalid post ID format' }).optional(),
  fileSize: z.coerce
    .number({ invalid_type_error: 'File size must be a valid number' })
    .int()
    .positive()
    .max(MAX_IMAGE_BYTES, { message: `File size exceeds the maximum limit of ${process.env.MAX_FILE_SIZE_MB || '10'}MB` }),

  mimetype: z.string().regex(/^image\/(jpeg|png|webp|gif)$/, {
    message: "Invalid file type. Only JPEG, PNG, WEBP, and GIF images are allowed"
  })
}).strict();

const confirmUploadSchema = z.object({
  mediaId: z.string().uuid({ message: 'Invalid media ID format' }),
  s3Key: z.string()
}).strict();

const mediaIdParamsSchema = z.object({
  mediaId: z.string().uuid({ message: 'Invalid media ID format' }),
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


module.exports = {
  paginationQuerySchema, getSignedUrlSchema, confirmUploadSchema,
  mediaIdParamsSchema,
};
