# app-updater — APK self-update for test builds

The app can update itself **in place** for APK test builds: it fetches an update
manifest, compares version codes, downloads the new APK and hands it to the
Android installer. **Store builds (Play Store / App Store) are completely
unaffected** — the feature is compiled out.

## How it works

```
app launch / foreground
      │
      ▼
AppUpdaterProvider (mounted via entry.direct.js → app-updater/AppWithUpdater.tsx)
      │  isUpdaterEnabled()?   ← Constants.expoConfig.extra.appUpdater.enabled
      ▼
fetch manifest  GET {manifestUrl}        → { data: { android: { versionCode, url, ... } } }
      │
      ▼
versionCode > installed versionCode?     (Application.nativeBuildVersion)
      │ yes
      ▼
prompt → download APK (expo-file-system, with progress)
      ▼
install via system installer
      (IntentLauncher + FileProvider content:// URI — no FileUriExposedException)
```

## Files

| File | Purpose |
| --- | --- |
| `updater.ts` | Core: config, manifest fetch, version compare, download, install |
| `AppUpdaterProvider.tsx` | React provider + prompt / progress / install / error UI |
| `AppWithUpdater.tsx` | Internal-only app wrapper that mounts the provider inside the theme tree |
| `types.ts` | Manifest types |

Plus two entry points at the app root: `entry.store.js` (plain App — used by
store builds) and `entry.direct.js` (App + updater — used by direct builds).
Everything else in the app is untouched; the module is self-contained.

## Enabling / disabling (the important part)

The feature is gated **at build time** in two places, so it's not just off —
it's *gone* from store builds:

1. **Entry point** — Metro reads the entry from `package.json#main`.
   `scripts/set-entry.js` switches it per build: `./entry.direct.js`
   (App + updater) for direct APKs, `./entry.store.js` (plain App) for
   store builds. The committed default is `entry.store.js`, and the store
   entry never imports the updater module — **updater code is not bundled at
   all** (verified by exporting both bundles).
2. **Config** — `app.config.js` only adds the `REQUEST_INSTALL_PACKAGES`
   permission and sets `extra.appUpdater.enabled=true` when the build
   environment has `APP_UPDATER_ENABLED=1`. Production/preview/development
   builds never get the permission, so even if updater code ran it couldn't
   install anything.

Just use the npm scripts (they run `set-entry.js` for you):

```bash
npm run build:android:direct   # direct APK — updater bundled + enabled
npm run build:android:store    # store AAB — updater absent entirely
```

## The manifest contract

The app fetches the manifest from `{EXPO_PUBLIC_BACKEND_URL}/api/v1/app-update`
(the updater endpoint lives on the same backend as the app, so there's no
separate manifest URL to configure — it's derived from the backend URL).
The server returns:

```json
{
  "success": true,
  "data": {
    "android": {
      "versionCode": 2,
      "versionName": "1.0.2",
      "url": "https://cdn.example.com/taddlebox-1.0.2.apk",
      "size": 21474836,
      "changelog": "• What's new\n• Bug fixes",
      "mandatory": false
    }
  }
}
```

- `versionCode` **must** match the Android `versionCode` of the APK you built.
  With the remote version source, EAS owns that number — `publish:update:direct`
  reads it automatically, so you never set it by hand.
- `url` must be a direct, public `https://` link to the APK.
- `size` (bytes) is optional; include it for an accurate progress bar.
- `mandatory: true` shows a non-dismissible prompt.
- If `android` is `null` / missing, no update is offered.

The parser also tolerates a static JSON served directly as `{ "android": {...} }`
(no `data` wrapper), so you can host the manifest on any static host (S3, GitHub
Pages, etc.) without the backend.

## Releasing an update to testers

Versioning is **fully automatic** — no app.json edits, no commits for version
numbers:

- `eas.json` uses `cli.appVersionSource: "remote"`, so EAS tracks
  `android.versionCode` on its servers and **increments it on every build**
  (both `internal` and `production` profiles have `autoIncrement: true`).
- `publish:update:direct` **auto-picks the versionCode from EAS** via
  `eas build:version:get --platform android --json` — the manifest can never
  drift from the APK that was actually built.

```bash
# 1. Build a new direct APK (EAS bumps versionCode remotely)
npm run build:android:direct

# 2a. Upload it to S3 through the backend and publish (recommended):
npm run publish:update:direct -- --apk path/to/taddlebox.apk \
  --server https://your-server.com --changelog "What's new in this build"
#   --server (or APP_UPDATE_SERVER_URL env) = backend base URL; the script calls
#     POST /api/v1/app-update/presign, PUTs the APK to S3, and writes the
#     CloudFront URL into the manifest
#   --filename overrides the S3 object name (default taddlebox-<versionCode>.apk)
#   --update-key (or APP_UPDATE_UPLOAD_KEY env) if the backend requires the
#     X-Update-Key header
#   --no-prune to keep the previous APK on S3 (default: it's deleted via
#     POST /api/v1/app-update/delete once the new one is published)

# 2b. Or host the APK yourself (your server, S3, etc.) and publish:
npm run publish:update:direct -- --url https://your-server.com/apk/taddlebox.apk \
  --changelog "What's new in this build"

#   add --mandatory to force the update on testers
#   add --size <bytes> to skip the automatic HEAD probe
#   add --version-code <N> to override the auto-detected one

# 3. Deploy the manifest file to the server — testers get prompted on next launch.
```

`publish:update:direct` resolves the versionCode in this order: `--version-code` flag
→ EAS remote (`eas build:version:get`) → app.json (warns: stale under remote
source). With `--apk` the size comes from the local file; with `--url` it probes
the APK size over HEAD. It then writes the manifest at
`../taddle-box/src/modules/app-update/app-update.manifest.json` (override with
`--manifest <path>`). It warns if the versionCode isn't higher than the
manifest's — a sure sign the previous build was never published.

## Notes & limitations

- **Android only.** iOS testers should use TestFlight; the updater is inert on
  iOS regardless.
- Android will ask the user to allow "Install unknown apps" for Taddlebox the
  first time — a normal sideload prompt.
- A previously downloaded APK is cached in the app cache dir and replaced on
  the next download.
- For JS-only fixes you don't need this at all — EAS Update (`expo-updates`)
  can push JS bundle changes without a new APK. This module covers native /
  full-APK changes.
- Keep the existing `app_config` `minimumVersion`/`latestVersion` fields for
  **store** builds (they link to the Play Store). Use this manifest for
  **APK** builds. Don't set both for the same build or you'll get two prompts.
- **Store builds don't contain this code at all.** `scripts/set-entry.js`
  points `package.json#main` at `entry.store.js` for store builds, and that
  entry never imports the updater module — so it's unreachable from the
  Play/App Store bundle (verified: the store export has zero updater strings).
- Signing: internal APKs and the Play release share one EAS keystore — see
  `docs/SIGNING.md` for backups and the Play App Signing upgrade path.
