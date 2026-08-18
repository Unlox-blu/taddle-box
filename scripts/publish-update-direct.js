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

async function main() {
  loadEnv();

  if (!fs.existsSync(APK_PATH)) {
    console.log(`ℹ No APK found at ${APK_PATH}. Nothing to publish.`);
    return;
  }

  const server = process.env.APP_UPDATE_SERVER_URL || process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!server) {
    console.error('❌ Missing APP_UPDATE_SERVER_URL or EXPO_PUBLIC_BACKEND_URL in .env');
    process.exit(1);
  }

  const updateKey = process.env.APP_UPDATE_UPLOAD_KEY || '';
  const endpoint = `${server.replace(/\/+$/, '')}/api/v1/app-releases/android/upload`;

  console.log(`ℹ Found APK at ${APK_PATH}.`);
  console.log(`ℹ Uploading to backend: ${endpoint}...`);

  const form = new FormData();
  form.append('apk', fs.createReadStream(APK_PATH));

  const headers = form.getHeaders();
  if (updateKey) {
    headers['X-Update-Key'] = updateKey;
  }

  try {
    const response = await axios.post(endpoint, form, {
      headers,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    if (response.status >= 200 && response.status < 300) {
      console.log('✔ Upload successful! Backend is processing the APK.');
      console.log('ℹ The local APK has been kept in build/apk/taddlebox.apk as requested.');
    } else {
      console.error(`❌ Upload failed with status ${response.status}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Upload failed:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(error.response.data);
    } else {
      console.error(error.message);
    }
    console.log('ℹ The APK remains in the queue (build/apk/taddlebox.apk). It will be retried next time.');
    process.exit(1);
  }
}

main();
