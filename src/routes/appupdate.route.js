'use strict';

const router = require('express').Router();
const { appUpdateController } = require('../modules/appupdate/appupdate.container');

// GET  /api/v1/app-update → { success, data: { android: {...} | null } }
router.get('/', appUpdateController.getManifest);

// GET /api/v1/app-update/download → JIT Handshake and CloudFront Redirect
router.get('/download', appUpdateController.downloadApk);

// POST /api/v1/app-update/upload → Used by local script to upload the APK
router.post('/upload', appUpdateController.uploadApk);

module.exports = router;
