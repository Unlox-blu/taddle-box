# scripts/

Build, release, verification, and asset-generation tooling. One-off migration
codemods are intentionally **not** kept here — once a restructure is applied the
tool is deleted (`fix-imports`, `rename-socket`, and their maps were removed
after the Phase 2/3 migrations completed).

Every script is invoked from the **project root** (`taddlebox-app/`). Prefer the
`npm run` alias where one exists; run the file directly with `node` only when a
script has no alias.

| Path | Purpose | Run |
|---|---|---|
| `babel/babel-plugin-updater-gate.js` | Babel plugin that erases the `app-updater` host import at build time when `APP_UPDATER_ENABLED != 1`, so **store builds contain zero updater code**. Registered from `babel.config.js` — do not move/rename without updating both. | *(automatic, via Babel)* |
| `build/eas-cli.js` | Runs the EAS CLI at the version pinned in `eas.json` → `cli.version` (single source of truth). Thin wrapper over `npx eas-cli`. | `npm run build:android:*` |
| `development/generate-logos.js` | Generates the branded per-game logo PNGs (`assets/logos/*.png`) consumed by the game logo pipeline / backend asset sync. Pure Node, no deps. | `npm run generate:logos` |
| `development/generate-sounds.js` | Generates the game sound-effect WAVs (`assets/sounds/*.wav`). Pure Node, no deps. | `npm run generate:sounds` |
| `development/setup.sh` | First-time developer bootstrap: clears `node_modules` + lockfile, then `npx expo install` resolves every dependency to an SDK-compatible version. Destructive (wipes `node_modules`) — run only when starting fresh. | `bash scripts/development/setup.sh` |
| `release/publish-update-development.js` | Uploads `build/apk/taddlebox-dev.apk` to the backend as a **development** (test) release, then deletes the APK. | `npm run publish:android:update:development` |
| `release/publish-update-direct.js` | Uploads `build/apk/taddlebox.apk` to the backend as a **direct** (sideload) release, then deletes the APK. | `npm run publish:android:update:direct` |
| `verification/check-architecture.js` | Enforces the one-way dependency rule (`app/shell → features → shared/design-system/infrastructure`). Exits 1 on violations. Runs on every src restructure. | `npm run check:architecture` |
| `verification/verify-updater-gate.js` | End-to-end proof that the updater gate is wired: plugin registered, import erasure works, `app-updater` imported from exactly one file, and store bundles ship without updater code. | `npm run verify:updater-gate` |

## Folder legend

- **`babel/`** — Babel plugins that participate in the build. Currently just the
  updater gate.
- **`build/`** — Build orchestration (EAS wrapper).
- **`development/`** — Local dev bootstrap + asset generators. Nothing here runs
  in CI or ships in the app.
- **`release/`** — Publishing a built artifact to the backend update channel.
- **`verification/`** — Guardrails that assert architectural/build invariants;
  these are the checks to wire into CI.

## The two load-bearing gates

`check-architecture.js` and `verify-updater-gate.js` protect the two invariants this
repo is built around: the layer rule and "zero updater code in store builds."
Both exit non-zero on failure, so they are safe to run in CI or pre-commit.
