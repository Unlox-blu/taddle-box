'use strict';

// ─── src/routes/media.route.js ───────────────────────────────────────────────
const router = require('express').Router();
const { mediaController }  = require('../modules/media/media.container');
const { verifyToken }      = require('../middlewares/auth.middleware');
const { uploadRateLimiter } = require('../middlewares/rate-limiter.middleware');

// For Images
router.post('/signed-url',                      verifyToken, uploadRateLimiter, mediaController.getSignedUrl);
router.post('/confirm',                         verifyToken, mediaController.confirmUpload);
router.delete('/:mediaId/cancle-upload',        verifyToken, mediaController.cancleImageUpload);

// For Videos
router.post('/video/upload-url',                verifyToken, uploadRateLimiter, mediaController.getVideoUploadUrl);
router.get('/:mediaId/status',                  verifyToken, mediaController.getMediaStatus);

// For Media Repo
router.get('/',                                 verifyToken, mediaController.getMedia);


// temporary for development 
router.get('/getbucket',                        verifyToken, uploadRateLimiter, mediaController.gets3Uploaded);

module.exports = router;