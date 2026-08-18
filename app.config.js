// ─── app.config.js ───────────────────────────────────────────────────────────
// Build-time config for the APK self-updater (app-updater/ folder).
//
// The self-update feature is ONLY enabled for direct/test APK builds. Set
// `APP_UPDATER_ENABLED=1` (e.g. in the eas.json "direct" profile) to turn it
// on. Store builds (Play Store / App Store) leave it unset → the updater code is
// inert at runtime AND the `REQUEST_INSTALL_PACKAGES` permission is never added
// to the manifest, so sideloading is impossible — Play Store compliant.
module.exports = ({ config }) => {
  const updaterEnabled = process.env.APP_UPDATER_ENABLED === '1';

  const android = config.android || {};
  const permissions = Array.isArray(android.permissions)
    ? [...android.permissions]
    : [];
  if (
    updaterEnabled &&
    !permissions.includes('android.permission.REQUEST_INSTALL_PACKAGES')
  ) {
    permissions.push('android.permission.REQUEST_INSTALL_PACKAGES');
  }

  return {
    ...config,
    // NOTE: the Metro entry point is NOT set here — it's read from
    // package.json `main`, which `scripts/set-entry.js` switches per build
    // (entry.direct.js for direct APKs, entry.store.js for store builds).
    // That's what keeps updater code out of the Play/App Store bundle.
    extra: {
      ...(config.extra || {}),
      appUpdater: {
        enabled: updaterEnabled,
        // The update manifest endpoint lives on the same backend as the app:
        // GET {EXPO_PUBLIC_BACKEND_URL}/api/v1/app-releases/android (see the
        // app-updater/README.md for the contract and the server endpoint).
        manifestUrl: process.env.EXPO_PUBLIC_BACKEND_URL
          ? `${process.env.EXPO_PUBLIC_BACKEND_URL.replace(/\/+$/, '')}/api/v1/app-releases/android?track=${process.env.EXPO_PUBLIC_APP_TRACK || 'production'}`
          : `https://your-server.com/api/v1/app-releases/android?track=${process.env.EXPO_PUBLIC_APP_TRACK || 'production'}`,
      },
    },
    android: {
      ...android,
      permissions,
    },
  };
};
