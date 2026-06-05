'use strict';

const { z } = require('zod');

const ALLOWED_MEDIA_TYPE = ['image/jpeg', 'image/jpeg', 'image/webp']

const fileSchema = z.object({
  mimetype: z.enum(ALLOWED_MEDIA_TYPE, `${ALLOWED_MEDIA_TYPE} these are only allowed types of file`),
  size: z.number().max(5 * 1024 * 1024, 'File size must be less than 5MB'),
});

// const result = fileSchema.safeParse(req.files.image);

// const result = (req, res, next) => {
//     console.log("Result   ",req.files)
//     res.status(200).json(req.files)
//     return
// }

module.exports = {fileSchema}