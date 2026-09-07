#!/usr/bin/env node
/**
 * check-layers.js — enforces Taddlebox's dependency direction.
 *
 *   app/shell (navigation, shell)  →  features  →  shared / design-system / infrastructure
 *
 * Rules applied to relative imports inside src/:
 *   - features       must not import shell, navigation
 *   - shared         must not import features, shell, navigation
 *   - design-system  must not import features, shared, shell, navigation, infrastructure
 *   - infrastructure must not import features, shared, design-system, shell, navigation
 *   - legacy dirs (lib, utils, types) are forbidden import targets — they no longer exist
 *
 * Usage: node scripts/verification/check-layers.js   (exits 1 on violations)
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const posix = (p) => p.split(path.sep).join("/");
const ROOT_POSIX = posix(ROOT);

const LAYERS = new Set(["features", "shared", "design-system", "infrastructure", "shell", "navigation"]);
const LEGACY = new Set(["lib", "utils", "types"]);
const FORBIDDEN = {
  // Features compose shell chrome (MainHeader, banners) but never navigation.
  features:       new Set(["navigation"]),
  shared:         new Set(["features", "shell", "navigation"]),
  "design-system": new Set(["features", "shared", "shell", "navigation", "infrastructure"]),
  // infrastructure consumes shared (DTO types, utils) but never features or UI.
  infrastructure: new Set(["features", "design-system", "shell", "navigation"]),
};

const SPEC = String.raw`(\.{1,2}(?:\/[^'"]*)?)`;
const SPECIFIER = new RegExp(`(\\b(?:from|import)\\s*)(['"])${SPEC}\\2`, "g");
const REQUIRE = new RegExp(`(\\brequire\\s*\\(\\s*)(['"])${SPEC}\\2(\\s*\\))`, "g");
const DYNAMIC = new RegExp(`(\\bimport\\s*\\(\\s*)(['"])${SPEC}\\2(\\s*\\))`, "g");

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".expo", ".git", "build", "dist"].includes(entry.name)) continue;
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      yield full;
    }
  }
}

const violations = [];
for (const file of walk(path.join(ROOT, "src"))) {
  const fileRel = path.posix.relative(ROOT_POSIX, posix(file));
  const layer = fileRel.split("/")[1]; // e.g. src/features/... → features
  if (!LAYERS.has(layer)) continue;
  const content = fs.readFileSync(file, "utf8");
  const fromDir = path.posix.dirname(fileRel);
  const all = [...content.matchAll(SPECIFIER), ...content.matchAll(REQUIRE), ...content.matchAll(DYNAMIC)];
  for (const m of all) {
    const target = path.posix.normalize(path.posix.join(fromDir, m[3]));
    const targetLayer = target.split("/")[1];
    if (LEGACY.has(targetLayer)) {
      violations.push(`${fileRel} imports legacy dir '${targetLayer}/' (${m[3]})`);
    } else if (LAYERS.has(targetLayer) && FORBIDDEN[layer]?.has(targetLayer)) {
      violations.push(`${fileRel} (${layer}) must not import ${targetLayer} (${m[3]})`);
    }
  }
}

if (violations.length > 0) {
  console.error(`Layer violations (${violations.length}):`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log("Layer check passed — dependency direction is clean.");