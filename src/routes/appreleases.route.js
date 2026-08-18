'use strict';

const router = require('express').Router();
const { appReleasesController } = require('../modules/appreleases/appreleases.container');

// GET  /api/v1/app-releases/android → { success, data: { android: {...} | null } }
router.get('/android', appReleasesController.getManifest);

// GET /api/v1/app-releases/android/download → JIT Handshake and CloudFront Redirect
router.get('/android/download', appReleasesController.downloadApk);

// POST /api/v1/app-releases/android/upload → Used by local script to upload the APK
router.post('/android/upload', appReleasesController.uploadApk);

module.exports = router;
