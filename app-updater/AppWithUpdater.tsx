// ─── app-updater/AppWithUpdater.tsx ─────────────────────────────────────────
// Direct/test-build app: the plain App plus the APK self-updater.
//
// Only referenced by `entry.direct.js` — the store entry (`entry.store.js`)
// never imports this module, so Metro never bundles any updater code into
// Play/App Store builds.
import React from 'react';
import { AppCore } from '../App';
import { AppUpdaterProvider } from './AppUpdaterProvider';

export default function AppWithUpdater() {
  return <AppCore insideTheme={<AppUpdaterProvider />} />;
}
