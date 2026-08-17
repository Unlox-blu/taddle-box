# app-updater — The Universal Upload Architecture

The app updater is a highly secure, heavily cached, and completely automated architecture designed for direct sideloaded APKs. It fetches an update manifest, downloads the new APK, and hands it to the Android system installer. 

**Store builds (Play Store / App Store) are completely unaffected** — the updater feature is physically compiled out of store builds.

## How the Architecture Works

This is a true enterprise-grade updater system with a "Just-In-Time" (JIT) security handshake and a centralized Redis caching layer.

### 1. The Upload Flow (Backend Heavy-Lifting)
Your local publishing script no longer requires AWS keys, Expo tokens, or complex logic. 
When you run `npm run publish:android:update:direct`, it simply POSTs your local APK to the backend.

1. **Native Parsing:** The backend natively parses the APK binary (using `app-info-parser`) to extract the exact `versionCode`, `versionName`, and package name (`com.taddlebox.app`).
2. **Security Handshake:** The backend generates a secret cryptographic signature.
3. **S3 Upload:** The backend uploads the APK to S3, attaching the signature and package name as **S3 Object Metadata**.
4. **Local Disk:** The backend writes the new update manifest to its local disk.
5. **Redis Cache:** The backend instantly caches the manifest in Redis with a 30-day TTL to prevent S3 hammering.

### 2. The Download Flow (JIT Security Intercept)
When users open the app, it hits `GET /api/v1/app-update`. The backend serves the cached manifest from Redis instantly (0 disk reads, 0 S3 calls). 

However, the `url` in the manifest does **not** point to S3. It points back to the backend (`/api/v1/app-update/download`).

When a user taps "Download Update":
1. **The Intercept:** The phone hits the backend `/download` endpoint.
2. **The Handshake:** The backend performs a lightning-fast `HeadObject` check against S3.
3. **The Lockout:** It compares the S3 metadata against the local manifest. If the package name isn't `com.taddlebox.app`, or if the cryptographic signature doesn't match (meaning someone manually tampered with the S3 bucket), the backend **aborts the download and instantly deletes the Redis cache**, locking down the system.
4. **The Redirect:** If the handshake passes, the backend returns an HTTP 302 Redirect, seamlessly bouncing the user's phone to the lightning-fast CloudFront CDN to download the 100MB file.

## Build & Publish Commands

You have complete manual control over every step of the pipeline.

### Local Sideload Build
```bash
# 1. Build locally. This ensures the output folder exists and outputs to build/apk/taddlebox.apk
npm run build:android:direct:local

# 2. Push it to your backend
npm run publish:android:update:direct
```

### Cloud Sideload Build (EAS)
```bash
# 1. Build on Expo Cloud. This will wait for the build to finish, and instantly download it to build/apk/taddlebox.apk
npm run build:android:direct:cloud

# 2. Push it to your backend
npm run publish:android:update:direct
```

### Store Builds (Google Play)
```bash
# 1. Build locally or in the cloud. It will output to build/aab/taddlebox.aab
npm run build:android:store:cloud

# 2. Submit the AAB directly to the Google Play Console
npm run publish:android:update:store
```

## Security & Protections

- **S3 Tamper-Proofing:** Because of the JIT Handshake, a malicious actor manually dropping an APK into your S3 bucket will accomplish nothing. The backend will reject the download and bust the cache.
- **Wrong Package Shield:** If you accidentally upload an old or incorrect APK to the backend, the backend will scan the internal package name and throw a critical error if it does not exactly match `com.taddlebox.app`.
- **Zero-Config Versioning:** Because the backend parses the APK binary directly, the `versionCode` in the manifest can mathematically never drift from the actual APK you upload. 

## Enabling / Disabling

The feature is gated **at build time**:
1. **Entry point:** `scripts/set-entry.js` switches `package.json#main` per build. `./entry.direct.js` includes the updater, while `./entry.store.js` does not. 
2. **Permissions:** The `REQUEST_INSTALL_PACKAGES` permission is only injected when building with the `direct` profile. Store builds do not receive this permission.
