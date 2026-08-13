// ─── entry.store.js ──────────────────────────────────────────────────────────
// Entry point for Play Store / App Store builds. Bundles ONLY the plain App —
// the app-updater module is not reachable from here, so no updater code ships
// in the store bundle. Selected by app.config.js when APP_UPDATER_ENABLED is
// not set.
import registerRootComponent from 'expo/src/launch/registerRootComponent';

import App from './App';

registerRootComponent(App);
