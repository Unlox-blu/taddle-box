# app-update — APK update manifest endpoint

Serves the update manifest consumed by the app's `app-updater` module
(see `taddlebox-app/app-updater/README.md`).

## Endpoint

```
GET /api/v1/app-update
```

Response:

```json
{
  "success": true,
  "message": "App update manifest fetched successfully",
  "data": {
    "android": {
      "versionCode": 2,
      "versionName": "1.0.2",
      "url": "https://your-server.com/apk/taddlebox-1.0.2.apk",
      "size": 21474836,
      "changelog": "• What's new\n• Bug fixes",
      "mandatory": false
    }
  }
}
```

When `app-update.manifest.json` is missing/invalid, `data.android` is `null` and
the app simply offers no update.

## Uploading the APK to S3 (presigned)

```
POST /api/v1/app-update/presign
{ "fileName": "taddlebox-3.apk" }
```

Response:

```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://s3…/apks/taddlebox-3.apk?X-Amz-…",
    "s3Key": "apks/taddlebox-3.apk",
    "finalUrl": "https://<cloudfront-domain>/apks/taddlebox-3.apk"
  }
}
```

- The APK is stored under the `apks/` folder in the existing S3 bucket and
  served via CloudFront — the same pattern as the media module.
- The release tool then PUTs the file straight to `uploadUrl` with
  `Content-Type: application/vnd.android.package-archive` (that content type is
  part of the signature, so it must match exactly).
- `fileName` must be a plain `.apk` filename (no slashes, no path traversal).
- If the `APP_UPDATE_UPLOAD_KEY` env var is set, the request must include the
  matching `X-Update-Key` header. Unset → the endpoint is open (dev).
- `taddlebox-app`'s `npm run publish:update:direct -- --apk <file> --server <base>`
  does the presign + upload + manifest write automatically.

## Deleting an APK (pruning old builds)

```
POST /api/v1/app-update/delete
{ "fileName": "taddlebox-2.apk" }
```

Deletes the object from the `apks/` S3 folder (`{ "s3Key": "apks/taddlebox-2.apk" }`
on success). `fileName` is validated exactly like presign, and the same
`X-Update-Key` guard applies. `publish:update:direct` calls this automatically
after a successful publish to prune the previous APK (unless `--no-prune` or the
same filename is reused); a failed prune is only a warning, never a publish
failure.

## Pushing a new version

1. Build a new direct APK.
2. Upload it (either run `publish:update:direct --apk` in `taddlebox-app`, or
   host the APK at a public https URL yourself and use
   `publish:update:direct --url`).
3. Update `app-update.manifest.json` — set `versionCode` to the new APK's
   versionCode (higher than the previous one), the APK `url`, the byte `size`
   and the `changelog`. Set `mandatory: true` to force the update.
4. Deploy the manifest file to the server (the file is read per request, no
   cache to clear).

To keep the manifest out of the repo, set the `APP_UPDATE_MANIFEST_PATH` env
var to another JSON file and edit that instead.
