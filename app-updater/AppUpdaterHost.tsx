// ─── app-updater/AppUpdaterHost.tsx ─────────────────────────────────────────────
// The root layout (src/app/_layout.tsx) renders <AppUpdaterHost />. In store
// builds babel-plugin-updater-gate replaces this import with a null component,
// so app-updater/* never enters the store bundle (same guarantee as the old
// entry-level split). Only direct/dev builds resolve this module.
export { AppUpdaterProvider as AppUpdaterHost } from './AppUpdaterProvider';
export { AppUpdaterProvider as UpdaterHost } from './AppUpdaterProvider';
