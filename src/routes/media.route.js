'use strict';

// ─── src/routes/media.route.js ───────────────────────────────────────────────
const router = require('express').Router();
const { mediaController }  = require('../container');
const { verifyToken }      = require('../middlewares/auth.middleware');
const { uploadRateLimiter } = require('../middlewares/rate-limiter.middleware');

router.post('/signed-url',        verifyToken, uploadRateLimiter, mediaController.getSignedUrl);
router.post('/confirm',           verifyToken, mediaController.confirmUpload);
router.post('/video/upload-url',  verifyToken, uploadRateLimiter, mediaController.getVideoUploadUrl);
router.get('/:id/status',         verifyToken, mediaController.getMediaStatus);
router.post('/upload-image',      verifyToken, mediaController.uploadImage);
router.get('/',                   verifyToken, mediaController.getMedia);
router.delete('/:mediaId',    verifyToken, mediaController.deleteMedia);

module.exports = router;
