/**
 * Switches package.json `main` between the two Metro entry points.
 * Pure Node — no dependencies.
 *
 * The Metro entry is read from package.json `main` (not app config), so the
 * right entry must be in place before `eas build` runs:
 *
 *   node scripts/set-entry.js store   → ./entry.store.js   (no updater code)
 *   node scripts/set-entry.js direct  → ./entry.direct.js  (APK self-updater)
 *
 * The committed default is `store`, so a bare `eas build` without this script
 * always produces a store-safe bundle. The npm scripts `build:android:store`
 * and `build:android:direct` call this automatically.
 */
const fs = require('fs');
const path = require('path');

const PKG_PATH = path.join(__dirname, '..', 'package.json');

const ENTRIES = {
  store: './entry.store.js',
  direct: './entry.direct.js',
};

const target = process.argv[2];
if (!ENTRIES[target]) {
  console.error('Usage: node scripts/set-entry.js <store|direct>');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
pkg.main = ENTRIES[target];
fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');

console.log(`✓ package.json main → ${ENTRIES[target]}`);
