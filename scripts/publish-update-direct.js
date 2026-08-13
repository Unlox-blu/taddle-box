/**
 * Publishes a new direct (sideloaded) APK release to the app-update manifest.
 * Pure Node — no dependencies beyond the eas-cli it shells out to.
 *
 * Usage (run from the app root, after `eas build --profile direct`):
 *   npm run publish:update:direct -- --apk <path/to/taddlebox.apk> \
 *     --server https://your-server.com --changelog "What's new in this build"
 *
 *   npm run publish:update:direct -- --url https://your-server.com/apk/taddlebox.apk \
 *     --changelog "What's new in this build"
 *
 * Options:
 *   --apk          (optional) local path of the freshly built APK → uploaded to
 *                  S3 via a presigned URL (POST /api/v1/app-update/presign on
 *                  the backend), and the S3/CloudFront URL goes in the manifest
 *   --server       (required with --apk) backend base URL, e.g. https://your-server.com
 *                  (or set the APP_UPDATE_SERVER_URL env var)
 *   --filename     (optional with --apk) S3 object name for the APK
 *                  (defaults to taddlebox-<versionCode>.apk)
 *   --update-key   (optional) shared secret for the X-Update-Key header, when
 *                  the backend sets APP_UPDATE_UPLOAD_KEY (or set the env var)
 *   --no-prune     (optional) flag → keep the previous APK on S3
 *   --url          (optional) public https:// URL of the APK when hosting it
 *                  yourself instead of uploading to S3
 *   --changelog    (optional) release notes shown in the update prompt
 *   --mandatory    (optional) flag → force the update on testers
 *   --size         (optional) APK size in bytes (auto-probed via HEAD if omitted)
 *   --version-code (optional) explicit versionCode; overrides auto-detection
 *   --manifest     (optional) path to the server manifest JSON
 *                  (defaults to ../taddle-box/src/modules/app-update/app-update.manifest.json)
 *
 * Exactly one of --apk / --url is required. With --apk the size comes from the
 * local file, so --size is ignored for the upload path.
 *
 * After a successful publish, the previous APK (from the manifest that was just
 * replaced) is deleted from S3 via POST /api/v1/app-update/delete, unless the
 * new build reuses the same filename or --no-prune is passed.
 *
 * The versionCode is picked automatically from EAS's REMOTE version source
 * (`eas build:version:get --platform android --json`), which EAS increments on
 * every build — so the manifest always matches the latest APK and every tester
 * is prompted to update. No app.json commits, ever.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { exec } = require('child_process');

const APP_ROOT = path.join(__dirname, '..');
const DEFAULT_MANIFEST = path.join(
  APP_ROOT,
  '..',
  'taddle-box',
  'src',
  'modules',
  'app-update',
  'app-update.manifest.json'
);

const APK_MIME = 'application/vnd.android.package-archive';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function readAppConfig() {
  const { expo } = require(path.join(APP_ROOT, 'app.json'));
  return expo;
}

/** Best-effort HEAD to find the APK size in bytes. Returns 0 on any failure. */
function probeSize(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https:') ? https : http;
    const req = mod.request(
      url,
      { method: 'HEAD', timeout: 8000 },
      (res) => {
        const len = parseInt(res.headers['content-length'] || '0', 10);
        resolve(Number.isFinite(len) && len > 0 ? len : 0);
        res.resume();
      }
    );
    req.on('error', () => resolve(0));
    req.on('timeout', () => {
      req.destroy();
      resolve(0);
    });
    req.end();
  });
}

/**
 * Minimal HTTP(S) request. Returns { status, body } where body is a string.
 * With `filePath` the file is streamed as the request body (used for the
 * presigned S3 PUT); otherwise `body` is written and the request ends.
 */
function httpRequest(method, url, { headers = {}, body, filePath } = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http;
    const req = mod.request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') })
      );
    });
    req.on('error', reject);
    req.setTimeout(60_000, () => req.destroy(new Error('request timed out')));

    if (filePath) {
      fs.createReadStream(filePath).on('error', reject).pipe(req);
    } else {
      if (body) req.write(body);
      req.end();
    }
  });
}

/** POST { fileName } to the backend presign endpoint → { uploadUrl, s3Key, finalUrl }. */
async function getPresignedUploadUrl(server, fileName, updateKey) {
  const endpoint = `${String(server).replace(/\/+$/, '')}/api/v1/app-update/presign`;
  const headers = { 'Content-Type': 'application/json' };
  if (updateKey) headers['X-Update-Key'] = updateKey;

  const res = await httpRequest('POST', endpoint, {
    headers,
    body: JSON.stringify({ fileName }),
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Presign failed (HTTP ${res.status}): ${res.body || '(no body)'}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    throw new Error(`Presign returned invalid JSON: ${res.body}`);
  }
  const data = parsed && parsed.data;
  if (!data || !data.uploadUrl || !data.finalUrl) {
    throw new Error(`Unexpected presign response: ${res.body}`);
  }
  return data;
}

/** PUTs the local APK to the presigned S3 URL. */
async function uploadApkToS3(uploadUrl, apkPath, size) {
  const res = await httpRequest('PUT', uploadUrl, {
    headers: { 'Content-Type': APK_MIME, 'Content-Length': String(size) },
    filePath: apkPath,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`S3 upload failed (HTTP ${res.status}): ${res.body || '(no body)'}`);
  }
}

/**
 * Extracts the APK object name from a CloudFront/S3 URL like
 * https://<host>/apks/taddlebox-3.apk. Returns null when the URL isn't one of
 * ours (e.g. a self-hosted /apk/ path), so those are never touched.
 */
function extractApkFileName(url) {
  if (!url) return null;
  const m = String(url).match(/\/apks\/([A-Za-z0-9][A-Za-z0-9._-]*\.apk)$/);
  return m ? m[1] : null;
}

/** POST { fileName } to the backend delete endpoint. */
async function deleteApkFromS3(server, fileName, updateKey) {
  const endpoint = `${String(server).replace(/\/+$/, '')}/api/v1/app-update/delete`;
  const headers = { 'Content-Type': 'application/json' };
  if (updateKey) headers['X-Update-Key'] = updateKey;

  const res = await httpRequest('POST', endpoint, {
    headers,
    body: JSON.stringify({ fileName }),
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Delete failed (HTTP ${res.status}): ${res.body || '(no body)'}`);
  }
}

/**
 * Runs `eas build:version:get --platform android --json` and returns the
 * versionCode from EAS's remote version source. Resolves to null on any
 * failure (not logged in, not configured, no network, CLI missing…).
 */
function getRemoteVersionCode() {
  return new Promise((resolve) => {
    exec(
      'node scripts/eas-cli.js build:version:get --platform android --json --non-interactive',
      { cwd: APP_ROOT, timeout: 60_000 },
      (err, stdout) => {
        if (err) return resolve(null);
        try {
          const json = JSON.parse(stdout.trim());
          const code = json?.versionCode;
          resolve(code !== undefined && code !== null ? String(code) : null);
        } catch {
          resolve(null);
        }
      }
    );
  });
}

async function resolveVersionCode(args) {
  // 1. Explicit override wins.
  if (args['version-code']) return String(args['version-code']);

  // 2. Auto-pick from EAS remote version source.
  const remote = await getRemoteVersionCode();
  if (remote) {
    console.log(`ℹ versionCode from EAS remote: ${remote}`);
    return remote;
  }

  // 3. Last resort: local app.json (stale when remote source is active —
  //    warn loudly so the mismatch is obvious).
  const expo = readAppConfig();
  const local = expo.android && expo.android.versionCode;
  if (Number.isFinite(local) && local > 0) {
    console.warn(
      `\nWARNING: could not read the versionCode from EAS (` +
        `eas build:version:get failed). Falling back to app.json (${local}), ` +
        `which is NOT incremented under the remote version source.\n`
    );
    return String(local);
  }

  console.error(
    'Could not determine the versionCode. Pass --version-code <N> explicitly.'
  );
  process.exit(1);
}

/**
 * Upload flow: presign → PUT to S3 → return { url, size }.
 * The backend returns the CloudFront URL; the local file size is authoritative.
 */
async function publishApkToS3(args, versionCode) {
  const apkPath = path.resolve(APP_ROOT, args.apk);
  if (!fs.existsSync(apkPath)) {
    console.error(`APK not found at ${apkPath}`);
    process.exit(1);
  }

  const server = args.server || process.env.APP_UPDATE_SERVER_URL;
  if (!server) {
    console.error('Missing --server <backend base URL> (or set APP_UPDATE_SERVER_URL).');
    process.exit(1);
  }

  const updateKey = args['update-key'] || process.env.APP_UPDATE_UPLOAD_KEY;
  const fileName = args.filename || `taddlebox-${versionCode}.apk`;
  const size = fs.statSync(apkPath).size;

  const { uploadUrl, finalUrl } = await getPresignedUploadUrl(server, fileName, updateKey);
  console.log(`ℹ Uploading ${fileName} (${size} bytes) to S3…`);
  await uploadApkToS3(uploadUrl, apkPath, size);
  console.log(`✔ Uploaded → ${finalUrl}`);

  return { url: finalUrl, size };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const hasUrl = Boolean(args.url);
  const hasApk = Boolean(args.apk);
  if (!hasUrl && !hasApk) {
    console.error('Missing required --url <public https URL> or --apk <local APK path>.');
    console.error('  npm run publish:update:direct -- --apk ./taddlebox.apk --server https://your-server.com --changelog "notes"');
    process.exit(1);
  }
  if (hasUrl && hasApk) {
    console.error('Provide either --url or --apk, not both.');
    process.exit(1);
  }

  const manifestPath = args.manifest
    ? path.resolve(APP_ROOT, args.manifest)
    : DEFAULT_MANIFEST;

  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest not found at ${manifestPath}`);
    console.error('Pass --manifest <path> to point at your server manifest file.');
    process.exit(1);
  }

  const versionCode = await resolveVersionCode(args);
  const expo = readAppConfig();

  let url = args.url;
  let size = args.size ? parseInt(args.size, 10) : 0;
  if (hasApk) {
    const uploaded = await publishApkToS3(args, versionCode);
    url = uploaded.url;
    size = uploaded.size;
  }

  const existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const existingUrl = existing?.android?.url || null;
  const existingCode = existing?.android?.versionCode || 0;
  if (parseInt(versionCode, 10) <= existingCode) {
    console.warn(
      `\nWARNING: versionCode ${versionCode} is not higher than the manifest's ` +
        `(${existingCode}). Testers with the previous build will NOT be prompted.\n`
    );
  }

  if (!size && url) size = await probeSize(url);
  const manifest = {
    android: {
      versionCode: parseInt(versionCode, 10),
      versionName: expo.version || String(versionCode),
      url,
      size,
      changelog: args.changelog || '',
      mandatory: args.mandatory === true,
    },
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  console.log('✓ Update published:');
  console.log(`  manifest   : ${manifestPath}`);
  console.log(`  versionCode: ${manifest.android.versionCode}`);
  console.log(`  versionName: ${manifest.android.versionName}`);
  console.log(`  url        : ${manifest.android.url}`);
  console.log(`  size       : ${manifest.android.size} bytes`);
  console.log(`  changelog  : ${manifest.android.changelog || '(none)'}`);
  console.log(`  mandatory  : ${manifest.android.mandatory}`);

  // Prune the previous APK from S3 now that the new one is published.
  // Skipped when: --no-prune, the old URL isn't an /apks/ object, the new
  // build reuses the same filename (the upload would have overwritten it), or
  // no backend --server was given. Failures are warnings — the publish itself
  // already succeeded.
  const previousApk = extractApkFileName(existingUrl);
  const newApkName = args.filename || (hasApk ? `taddlebox-${versionCode}.apk` : null);
  if (!args['no-prune'] && previousApk && previousApk !== newApkName) {
    const server = args.server || process.env.APP_UPDATE_SERVER_URL;
    if (server) {
      try {
        await deleteApkFromS3(server, previousApk, args['update-key'] || process.env.APP_UPDATE_UPLOAD_KEY);
        console.log(`✔ Pruned previous APK from S3: ${previousApk}`);
      } catch (error) {
        console.warn(
          `\nWARNING: could not delete the previous APK (${previousApk}) from S3: ${error.message}\n`
        );
      }
    } else {
      console.warn('\nWARNING: not pruning the previous APK — pass --server (or set APP_UPDATE_SERVER_URL) to enable cleanup.\n');
    }
  } else if (previousApk && previousApk === newApkName) {
    console.log(`ℹ Not pruning ${previousApk} — the new upload reuses the same filename.`);
  }

  console.log('\nNext: deploy the manifest file to the server so testers fetch the new manifest.');
}

main();
