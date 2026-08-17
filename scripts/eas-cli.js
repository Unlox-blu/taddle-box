/**
 * Runs the eas-cli at the version pinned in `eas.json` → `cli.version` via
 * npx. eas.json is the single source of truth for the CLI version — nothing
 * else hardcodes it.
 *
 * Usage:
 *   node scripts/eas-cli.js <eas args...>
 *   node scripts/eas-cli.js build --platform android --profile production
 *
 * `cli.version` may be an exact version ("21.8.0") — used as-is, no network —
 * or a semver range (">= 21.0.0", "^21.8.0"), in which case the latest version
 * satisfying the range is resolved via `npm view` and that exact version is
 * installed. If the version cannot be resolved (bad spec / no network), the
 * launcher fails loudly instead of silently drifting.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APP_ROOT = path.join(__dirname, '..');

const PLAIN_VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/** Returns an exact, installable version for the given cli.version spec. */
function resolvePinnedVersion(spec) {
  if (!spec) return null;
  const trimmed = spec.trim();
  if (PLAIN_VERSION_RE.test(trimmed)) return trimmed; // exact version — no registry call

  // Range → ask npm for the versions that satisfy it (listed ascending, one
  // per line as `eas-cli@x.y.z 'x.y.z'`) and take the last one.
  try {
    const out = execSync(`npm view "eas-cli@${trimmed}" version`, {
      cwd: APP_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
    });
    const lines = out
      .trim()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const last = lines[lines.length - 1];
    // `eas-cli@21.8.0 '21.8.0'` → `21.8.0`; plain `21.8.0` works too.
    const quoted = last && last.match(/'([^']+)'\s*$/);
    const resolved = (quoted ? quoted[1] : last || '').trim();
    return resolved && PLAIN_VERSION_RE.test(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

const { cli } = require(path.join(APP_ROOT, 'eas.json'));

const version = resolvePinnedVersion(cli && cli.version);
if (!version) {
  console.error(
    `Could not resolve an eas-cli version from cli.version = "${cli && cli.version}".\n` +
      'Set an exact version (e.g. "21.8.0") or a resolvable semver range, and check your network.'
  );
  process.exit(1);
}

const args = process.argv
  .slice(2)
  .map((a) => (/\s/.test(a) ? `"${a}"` : a))
  .join(' ');
const cmd = `npx --yes eas-cli@${version} ${args}`.trim();

try {
  const envPath = path.join(APP_ROOT, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split(/\r?\n/).forEach((line) => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (e) {
  // ignore
}

try {
  execSync(cmd, { cwd: APP_ROOT, stdio: 'inherit', env: process.env });
} catch (error) {
  process.exit(error.status || 1);
}
