/**
 * Publishes a new direct (sideloaded) APK release.
 * Takes the APK from ./build/apk/taddlebox.apk and POSTs it to the backend.
 * Deletes the APK upon successful upload.
 */
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios'); // Requires axios, we'll ensure it's in package.json or use node-fetch

const APP_ROOT = path.join(__dirname, '..');
const APK_PATH = path.join(APP_ROOT, 'build', 'apk', 'taddlebox.apk');

function loadEnv() {
  const envPaths = [
    path.join(APP_ROOT, '.env.production'),
    path.join(APP_ROOT, '.env')
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split(/\r?\n/).forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const value = parts.slice(1).join('=').trim();
          if (process.env[key] === undefined) process.env[key] = value;
        }
      });
    }
  }
}

async function uploadApk(serverUrl, updateKey) {
  const endpoint = `${serverUrl.replace(/\/+$/, '')}/api/v1/app-releases/android/upload`;
  console.log(`ℹ Uploading to backend: ${endpoint}...`);

  const form = new FormData();
  form.append('apk', fs.createReadStream(APK_PATH));

  const headers = form.getHeaders();
  if (updateKey) {
    headers['X-Update-Key'] = updateKey;
  }

  const response = await axios.post(endpoint, form, {
    headers,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  return response;
}

async function main() {
  loadEnv();

  if (!fs.existsSync(APK_PATH)) {
    console.log(`ℹ No APK found at ${APK_PATH}. Nothing to publish.`);
    return;
  }

  const prodServer = process.env.APP_UPDATE_SERVER_URL || process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!prodServer) {
    console.error('❌ Missing APP_UPDATE_SERVER_URL or EXPO_PUBLIC_BACKEND_URL in .env');
    process.exit(1);
  }

  const updateKey = process.env.APP_UPDATE_UPLOAD_KEY || '';
  console.log(`ℹ Found APK at ${APK_PATH}.`);

  try {
    const response = await uploadApk(prodServer, updateKey);
    if (response.status >= 200 && response.status < 300) {
      const proxyLink = `${prodServer.replace(/\/+$/, '')}/api/v1/app-releases/android/download`;
      console.log('✔ Upload successful!\n');
      console.log('APK:');
      console.log(`Downloadable Link: ${proxyLink}`);
      console.log(`Local Folder: ${APK_PATH}`);
      return;
    } else {
      throw new Error(`Upload failed with status ${response.status}`);
    }
  } catch (error) {
    console.warn(`⚠ Upload to prod server (${prodServer}) failed.`);
    if (error.response) {
      console.warn(`  Status: ${error.response.status}`);
    } else {
      console.warn(`  Error: ${error.message}`);
    }

    const fallbackServer = 'https://server.taddlebox.com';
    console.log(`\nℹ Attempting hardcoded final fallback to: ${fallbackServer}`);

    try {
      const fallbackResponse = await uploadApk(fallbackServer, updateKey);
      if (fallbackResponse.status >= 200 && fallbackResponse.status < 300) {
        const proxyLink = `${fallbackServer.replace(/\/+$/, '')}/api/v1/app-releases/android/download`;
        console.log('✔ Fallback Upload successful!\n');
        console.log('APK:');
        console.log(`Downloadable Link: ${proxyLink}`);
        console.log(`Local Folder: ${APK_PATH}`);
        return;
      } else {
        throw new Error(`Fallback upload failed with status ${fallbackResponse.status}`);
      }
    } catch (fallbackError) {
      console.error('\n❌ All upload attempts failed:');
      if (fallbackError.response) {
        console.error(`Status: ${fallbackError.response.status}`);
        console.error(fallbackError.response.data);
      } else {
        console.error(fallbackError.message);
      }
      console.log('ℹ The APK remains in the queue (build/apk/taddlebox.apk). It will be retried next time.');
      process.exit(1);
    }
  }
}

main();
