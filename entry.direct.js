// ─── entry.direct.js ─────────────────────────────────────────────────────────
// Entry point for direct-install (sideloaded) APK builds: the plain App plus
// the APK self-updater. Selected by app.config.js when APP_UPDATER_ENABLED=1.
import registerRootComponent from 'expo/src/launch/registerRootComponent';

import AppWithUpdater from './app-updater/AppWithUpdater';

registerRootComponent(AppWithUpdater);
