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
const APK_PATH = path.join(APP_ROOT, 'build', 'apk', 'taddlebox-dev.apk');

function loadEnv() {
  const envPaths = [
    path.join(APP_ROOT, '.env.development'),
    path.join(APP_ROOT, '.env.local'),
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
  const endpoint = `${serverUrl.replace(/\/+$/, '')}/api/v1/app-releases/android/upload?track=development`;
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

function getEnvVarFromFile(envFile, key) {
  const fullPath = path.join(APP_ROOT, envFile);
  if (!fs.existsSync(fullPath)) return null;
  const content = fs.readFileSync(fullPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const parts = line.split('=');
    if (parts.length >= 2 && parts[0].trim() === key) {
      return parts.slice(1).join('=').trim();
    }
  }
  return null;
}

async function main() {
  loadEnv();

  if (!fs.existsSync(APK_PATH)) {
    console.log(`ℹ No APK found at ${APK_PATH}. Nothing to publish.`);
    return;
  }

  const devServer = process.env.APP_UPDATE_SERVER_URL || process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!devServer) {
    console.error('❌ Missing APP_UPDATE_SERVER_URL or EXPO_PUBLIC_BACKEND_URL in .env');
    process.exit(1);
  }

  const updateKey = process.env.APP_UPDATE_UPLOAD_KEY || '';
  console.log(`ℹ Found APK at ${APK_PATH}.`);

  try {
    const response = await uploadApk(devServer, updateKey);
    if (response.status >= 200 && response.status < 300) {
      if (typeof response.data === 'string' && response.data.includes('internal errors')) {
        throw new Error(`Backend returned 200 but failed internally: ${response.data}`);
      }
      const proxyLink = `${devServer.replace(/\/+$/, '')}/api/v1/app-releases/android/download?track=development`;
      console.log('✔ Upload successful!\n');
      console.log('APK:');
      console.log(`Downloadable Link: ${proxyLink}`);
      console.log(`Local Folder: ${APK_PATH}`);
      return;
    } else {
      throw new Error(`Upload failed with status ${response.status}`);
    }
  } catch (error) {
    console.warn(`⚠ Upload to dev server (${devServer}) failed.`);
    if (error.response) {
      console.warn(`  Status: ${error.response.status}`);
    } else {
      console.warn(`  Error: ${error.message}`);
    }

    console.log('\nℹ Attempting fallback to production server...');
    const prodServer = getEnvVarFromFile('.env.production', 'EXPO_PUBLIC_BACKEND_URL');
    
    let fallbackServer = prodServer;
    if (!fallbackServer) {
      console.warn('⚠ Could not find EXPO_PUBLIC_BACKEND_URL in .env.production.');
      fallbackServer = 'https://server.taddlebox.com';
      console.log(`ℹ Attempting hardcoded final fallback to: ${fallbackServer}`);
    }

    try {
      const prodResponse = await uploadApk(fallbackServer, updateKey);
      if (prodResponse.status >= 200 && prodResponse.status < 300) {
        if (typeof prodResponse.data === 'string' && prodResponse.data.includes('internal errors')) {
          throw new Error(`Fallback backend returned 200 but failed internally: ${prodResponse.data}`);
        }
        const proxyLink = `${fallbackServer.replace(/\/+$/, '')}/api/v1/app-releases/android/download?track=development`;
        console.log('✔ Fallback Upload successful!\n');
        console.log('APK:');
        console.log(`Downloadable Link: ${proxyLink}`);
        console.log(`Local Folder: ${APK_PATH}`);
        return;
      } else {
        throw new Error(`Fallback upload failed with status ${prodResponse.status}`);
      }
    } catch (fallbackError) {
      if (prodServer) {
         console.warn(`\n⚠ Fallback to .env.production server failed.`);
         console.log(`ℹ Attempting hardcoded final fallback to: https://server.taddlebox.com`);
         try {
           const finalResponse = await uploadApk('https://server.taddlebox.com', updateKey);
           if (finalResponse.status >= 200 && finalResponse.status < 300) {
             if (typeof finalResponse.data === 'string' && finalResponse.data.includes('internal errors')) {
               throw new Error(`Final fallback backend returned 200 but failed internally: ${finalResponse.data}`);
             }
             const proxyLink = `https://server.taddlebox.com/api/v1/app-releases/android/download?track=development`;
             console.log('✔ Final Fallback Upload successful!\n');
             console.log('APK:');
             console.log(`Downloadable Link: ${proxyLink}`);
             console.log(`Local Folder: ${APK_PATH}`);
             return;
           } else {
             throw new Error(`Final fallback upload failed with status ${finalResponse.status}`);
           }
         } catch (finalError) {
            console.error('\n❌ All upload attempts failed:');
            if (finalError.response) {
              console.error(`Status: ${finalError.response.status}`);
              console.error(finalError.response.data);
            } else {
              console.error(finalError.message);
            }
            console.log('ℹ The APK remains in the queue (build/apk/taddlebox-dev.apk). It will be retried next time.');
            process.exit(1);
         }
      } else {
        console.error('\n❌ Fallback upload failed:');
        if (fallbackError.response) {
          console.error(`Status: ${fallbackError.response.status}`);
          console.error(fallbackError.response.data);
        } else {
          console.error(fallbackError.message);
        }
        console.log('ℹ The APK remains in the queue (build/apk/taddlebox-dev.apk). It will be retried next time.');
        process.exit(1);
      }
    }
  }
}

main();
