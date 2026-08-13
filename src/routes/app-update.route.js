'use strict';

const router = require('express').Router();
const { appUpdateController } = require('../modules/app-update/app-update.container');

// GET  /api/v1/app-update → { success, data: { android: {...} | null } }
router.get('/', appUpdateController.getManifest);

// POST /api/v1/app-update/presign → presigned S3 upload URL for a release APK
// (used by taddlebox-app's publish:update:direct script with --apk).
router.post('/presign', appUpdateController.getUploadUrl);

// POST /api/v1/app-update/delete → deletes an APK from the apks/ S3 folder
// (used by publish:update:direct to prune the previous build).
router.post('/delete', appUpdateController.deleteApk);

module.exports = router;
