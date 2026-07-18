'use strict';

// ─── src/routes/media.route.js ───────────────────────────────────────────────
const router = require('express').Router();
const { mediaController }  = require('../modules/media/media.container');
const { verifyToken }      = require('../middlewares/auth.middleware');
const { uploadRateLimiter } = require('../middlewares/rate-limiter.middleware');
const { validateRequest } = require('../middlewares/validator.middleware');
const { getSignedUrlSchema, confirmUploadSchema, mediaIdParamsSchema, paginationQuerySchema } = require('../modules/media/media.validator');

// For Images
router.post('/signed-url',                verifyToken, uploadRateLimiter,   validateRequest({body: getSignedUrlSchema}),   mediaController.getSignedUrl);
router.post('/confirm',                   verifyToken,                      validateRequest({body: confirmUploadSchema}),  mediaController.confirmUpload);
router.delete('/:mediaId/cancle-upload',  verifyToken,                      validateRequest({params: mediaIdParamsSchema}),mediaController.cancleImageUpload);

// For Videos
router.post('/video/upload-url',          verifyToken, uploadRateLimiter, mediaController.getVideoUploadUrl);
router.get('/:mediaId/status',            verifyToken, mediaController.getMediaStatus);

// For Media Repo
router.get('/',                           verifyToken, validateRequest({query: paginationQuerySchema}), mediaController.getMedia);


module.exports = router;