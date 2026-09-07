#!/usr/bin/env node
/**
 * verify-updater-gate.js
 *
 * Verifies the APK self-updater stays out of store bundles, end to end:
 *
 *   1. REGISTRATION — babel.config.js must register babel-plugin-updater-gate
 *      exactly when APP_UPDATER_ENABLED / EXPO_PUBLIC_IS_DIRECT are unset
 *      (store builds) and must NOT register it for direct/dev profiles.
 *   2. TRANSFORM — with the gate active, compiling src/app/_layout.tsx must
 *      erase the app-updater/UpdaterHost import (replaced by a null
 *      component); with the gate off the import must survive untouched.
 *   3. REACHABILITY — src/app/_layout.tsx must be the ONLY importer of
 *      app-updater/* anywhere in the app source, so erasing that one import
 *      makes the whole module unreachable to Metro (zero updater code in the
 *      store bundle).
 *
 * Usage: node scripts/verification/verify-updater-gate.js   (exits 1 on any failure)
 */
const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

const ROOT = path.resolve(__dirname, "..", "..");
const GATE_PLUGIN = "./scripts/babel/babel-plugin-updater-gate";
const LAYOUT = path.join(ROOT, "src/app/_layout.tsx");
// Any import/require whose module specifier references app-updater.
const IMPORTER_RE = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]*app-updater[^'"]*)['"]/g;

let failures = 0;
const pass = (msg) => console.log(`  \u2713 ${msg}`);
const fail = (msg) => {
  failures += 1;
  console.error(`  \u2717 ${msg}`);
};
const section = (msg) => console.log(`\n\u2500\u2500 ${msg}`);

// ── 1. Registration: babel.config.js plugin list per profile ───────────────
section("1. babel.config.js registers the gate only for store builds");
const configFactory = require(path.join(ROOT, "babel.config.js"));
const ENV_KEYS = ["APP_UPDATER_ENABLED", "EXPO_PUBLIC_IS_DIRECT"];
const savedEnv = {};
for (const k of ENV_KEYS) savedEnv[k] = process.env[k];

const pluginsFor = (envOverrides) => {
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(envOverrides)) process.env[k] = v;
  try {
    const cfg = configFactory({
      env: () => "production",
      cache: { forever: () => {}, never: () => {}, using: () => {} },
      caller: undefined,
    });
    return cfg.plugins || [];
  } finally {
    for (const k of ENV_KEYS) delete process.env[k];
  }
};

const hasGate = (plugins) =>
  plugins.some((p) => Array.isArray(p) ? p[0] === GATE_PLUGIN : p === GATE_PLUGIN);

if (hasGate(pluginsFor({}))) pass("store profile (env unset): gate registered");
else fail("store profile (env unset): gate NOT registered — updater would leak into store bundles");

if (!hasGate(pluginsFor({ APP_UPDATER_ENABLED: "1" })))
  pass("direct/dev profile (APP_UPDATER_ENABLED=1): gate not registered");
else fail("direct/dev profile: gate registered but updater is enabled — updater host would be nulled");

if (!hasGate(pluginsFor({ EXPO_PUBLIC_IS_DIRECT: "true" })))
  pass("direct profile (EXPO_PUBLIC_IS_DIRECT=true): gate not registered");
else fail("direct profile: gate registered but updater is enabled");

for (const k of ENV_KEYS) {
  if (savedEnv[k] !== undefined) process.env[k] = savedEnv[k];
  else delete process.env[k];
}

// ── 2. Transform: layout with gate on erases the import; off keeps it ───────
section("2. src/app/_layout.tsx transform behaviour");

const source = fs.readFileSync(LAYOUT, "utf8");
const gatePlugin = path.join(ROOT, GATE_PLUGIN);

function transform(useGate) {
  return babel.transformSync(source, {
    filename: LAYOUT,
    babelrc: false,
    configFile: false,
    compact: false,
    plugins: useGate ? [gatePlugin] : [],
    parserOpts: { plugins: ["typescript", "jsx"] },
  }).code;
}

const gated = transform(true);
const plain = transform(false);

if (gated.includes("app-updater/AppUpdaterHost") || gated.includes("app-updater/UpdaterHost"))
  fail("gate ON: app-updater import still present after transform");
else pass("gate ON: app-updater/(App)UpdaterHost import erased");

if (/const\s+(App)?UpdaterHost\s*=\s*\(\)\s*=>\s*null/.test(gated))
  pass("gate ON: import replaced with null component ((App)UpdaterHost = () => null)");
else fail("gate ON: no null-component replacement found");

if (plain.includes("../../app-updater/AppUpdaterHost") || plain.includes("../../app-updater/UpdaterHost"))
  pass("gate OFF: import survives untouched (updater host available)");
else fail("gate OFF: import was altered even though the gate is inactive");

// ── 3. Reachability: only _layout imports app-updater ──────────────────────
section("3. app-updater is imported from exactly one file in src/ (src/app/_layout.tsx)");

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".expo", ".git", "build", "dist"].includes(entry.name)) continue;
      yield* walk(full);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      yield full;
    }
  }
}

const importers = [];
for (const file of walk(path.join(ROOT, "src"))) {
  const content = fs.readFileSync(file, "utf8");
  IMPORTER_RE.lastIndex = 0;
  let m;
  while ((m = IMPORTER_RE.exec(content)) !== null) {
    const fileRel = path.relative(ROOT, file).split(path.sep).join("/");
    if (!importers.includes(fileRel)) importers.push(fileRel);
  }
}

const expected = ["src/app/_layout.tsx"];
if (
  importers.length === expected.length &&
  importers.every((f, i) => f === expected[i])
) {
  pass("app-updater/* imported only by src/app/_layout.tsx — erasure fully disconnects it");
} else {
  fail(
    `unexpected app-updater importers (${importers.length}): ${importers.join(", ")}`
  );
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log("");
if (failures > 0) {
  console.error(`Updater gate verification FAILED (${failures} issue${failures === 1 ? "" : "s"}).`);
  process.exit(1);
}
console.log("Updater gate verification PASSED — store builds contain zero updater code.");
