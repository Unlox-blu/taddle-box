/**
 * GameRuntimeRegistry — maps backend runtime identifiers to frontend Runtime components.
 *
 * Key format: "runtime@version" (e.g. "ludo@1", "chess@1")
 * Backend sends: { runtime: "ludo", runtimeVersion: 1 }
 * Registry looks up: "ludo@1"
 *
 * Validation flow (AppGameHost):
 *   1. runtime exists?        → RUNTIME_TO_COMPONENT has the key
 *   2. runtime version OK?    → key found
 *   3. protocol compatible?   → contract.protocolVersion matches backend
 *   4. app version OK?        → APP_VERSION >= minAppVersion
 *   5. → launch
 *
 * Architecture:
 *   Backend owns: rules, validation, state, turns, rewards, timers, persistence, asset manifests.
 *   Frontend owns: rendering, animations, effects, sounds, interactions.
 *
 * Security: the registry is a CLOSED allowlist. Backend can only SELECT from
 * shipped runtimes — never construct module paths or import arbitrary code.
 */

import React from "react";
import { APP_VERSION } from "../utils/appVersion";
import type { RuntimeContract, RuntimeFeature } from "./types";

// ── Runtime contracts — declare what each shipped runtime supports ──────────
// Backend MUST match these when selecting a runtime for a game.
// protocolVersion is derived entirely from the client — backend cannot spoof it.

const RUNTIME_CONTRACTS: Record<string, RuntimeContract> = {
  "chess@1": {
    runtime: "chess",
    version: 1,
    protocolVersion: 1,
    features: ["full-sync", "reconnect", "animations", "bots"],
  },
  "ludo@1": {
    runtime: "ludo",
    version: 1,
    protocolVersion: 1,
    features: ["full-sync", "reconnect", "animations", "chat", "bots"],
  },
  "snake-ladder@1": {
    runtime: "snake-ladder",
    version: 1,
    protocolVersion: 1,
    features: ["full-sync", "reconnect", "animations", "chat", "bots"],
  },
  "scribble@1": {
    runtime: "scribble",
    version: 1,
    protocolVersion: 1,
    features: ["full-sync", "reconnect", "animations", "chat", "bots"],
  },
  "word-rush@1": {
    runtime: "word-rush",
    version: 1,
    protocolVersion: 1,
    features: ["full-sync", "reconnect", "animations", "bots"],
  },
  "tap-rush@1": {
    runtime: "tap-rush",
    version: 1,
    protocolVersion: 1,
    features: ["full-sync", "reconnect", "animations", "bots"],
  },
  "memory-grid@1": {
    runtime: "memory-grid",
    version: 1,
    protocolVersion: 1,
    features: ["full-sync", "reconnect", "animations", "bots"],
  },
};

// ── Runtime → Component mapping (CLOSED ALLOWLIST) ─────────────────────────
// Key = "runtime@version" (e.g. "ludo@1")
// Value = lazy-loaded Runtime component that owns socket lifecycle + state
//
// SECURITY: backend can only SELECT from these keys.
// Never: import(runtime), require(`./${runtime}/${version}`), or dynamic paths.

const RUNTIME_TO_COMPONENT: Record<string, React.LazyExoticComponent<any>> = {
  "chess@1":        React.lazy(() => import("../components/games/app/chess/ChessRuntime")),
  "ludo@1":         React.lazy(() => import("../components/games/app/ludo/LudoRuntime")),
  "snake-ladder@1": React.lazy(() => import("../components/games/app/snake-ladder/SnakeLadderRuntime")),
  "scribble@1":     React.lazy(() => import("../components/games/app/scribble/ScribbleRuntime")),
  "word-rush@1":    React.lazy(() => import("../components/games/app/word-rush/WordRushRuntime")),
  "tap-rush@1":     React.lazy(() => import("../components/games/app/tap-rush/TapRushRuntime")),
  "memory-grid@1":  React.lazy(() => import("../components/games/app/memory-grid/MemoryGridRuntime")),
};

// ── Semver helpers ─────────────────────────────────────────────────────────

/**
 * Compare two semver strings (major.minor.patch).
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b.
 * Handles non-numeric segments gracefully (treats them as 0).
 *
 * compareSemver("1.10.0", "1.9.0")  → 1  (correct: 1.10 > 1.9)
 * compareSemver("1.9.0", "1.10.0")  → -1
 * compareSemver("2.0.0", "2.0.0")   → 0
 */
function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Build the registry key from backend fields. */
export function runtimeKey(runtime: string, version: number): string {
  return `${runtime}@${version}`;
}

/** Get the React Runtime component for a runtime key. */
export function getRuntimeComponent(runtime: string, version: number): React.LazyExoticComponent<any> | null {
  return RUNTIME_TO_COMPONENT[runtimeKey(runtime, version)] || null;
}

/** Eagerly trigger the lazy import for a runtime so the bundle resolves in the background.
 *  Call this when the player taps PLAY — by the time the game mounts the module is ready. */
const PRELOAD_IMPORTS: Record<string, Promise<any> | undefined> = {};

export function preloadRuntime(runtime: string, version: number): void {
  const key = runtimeKey(runtime, version);
  if (PRELOAD_IMPORTS[key]) return; // already loading
  const map: Record<string, () => Promise<any>> = {
    'chess@1': () => import('../components/games/app/chess/ChessRuntime'),
    'ludo@1': () => import('../components/games/app/ludo/LudoRuntime'),
    'snake-ladder@1': () => import('../components/games/app/snake-ladder/SnakeLadderRuntime'),
    'scribble@1': () => import('../components/games/app/scribble/ScribbleRuntime'),
    'word-rush@1': () => import('../components/games/app/word-rush/WordRushRuntime'),
    'tap-rush@1': () => import('../components/games/app/tap-rush/TapRushRuntime'),
    'memory-grid@1': () => import('../components/games/app/memory-grid/MemoryGridRuntime'),
  };
  if (map[key]) PRELOAD_IMPORTS[key] = map[key]();
}

/** Check if a runtime key has a registered component. */
export function isRuntimeSupported(runtime: string, version: number): boolean {
  return runtimeKey(runtime, version) in RUNTIME_TO_COMPONENT;
}

/** Get the runtime contract for a runtime key (features, protocol version). */
export function getRuntimeContract(runtime: string, version: number): RuntimeContract | null {
  return RUNTIME_CONTRACTS[runtimeKey(runtime, version)] || null;
}

/**
 * Check if the current app version meets the minAppVersion requirement.
 * Returns true if minAppVersion is not set, or APP_VERSION >= minAppVersion.
 */
export function isVersionCompatible(minAppVersion?: string): boolean {
  if (!minAppVersion) return true;
  return compareSemver(APP_VERSION, minAppVersion) >= 0;
}

/**
 * Check if the backend's protocol version is compatible with the client's.
 *
 * The client's RUNTIME_CONTRACTS defines the SUPPORTED range for each runtime.
 * Backend cannot spoof the protocol version — it's derived from the client registry.
 *
 * Migration: if the backend omits protocolVersion, emit telemetry and assume
 * compatible. After migration, flip REQUIRE_PROTOCOL_VERSION to true to reject.
 */
const REQUIRE_PROTOCOL_VERSION = false; // TODO: flip to true after backend migration

export function isProtocolCompatible(
  runtime: string,
  version: number,
  backendProtocolVersion?: number,
): boolean {
  const contract = getRuntimeContract(runtime, version);
  if (!contract) return false; // runtime not registered → incompatible

  if (backendProtocolVersion == null) {
    // Migration period: backend hasn't adopted protocolVersion yet.
    // Emit telemetry so we can track when the old contract is still in use.
    console.warn(
      `[GameRegistry] GAME_PROTOCOL_VERSION_MISSING: runtime=${runtime}@${version} — ` +
      `backend did not send protocolVersion. This will be rejected after migration.`,
    );
    return !REQUIRE_PROTOCOL_VERSION;
  }

  // Backend sent a protocol version — check it's within the supported range.
  // For now: exact match. When multiple protocol versions are supported:
  //   return backendProtocolVersion >= contract.minProtocolVersion
  //       && backendProtocolVersion <= contract.maxProtocolVersion;
  return contract.protocolVersion === backendProtocolVersion;
}

/** Check if the runtime supports a specific rendering/protocol feature. */
export function hasFeature(runtime: string, version: number, feature: RuntimeFeature): boolean {
  const contract = getRuntimeContract(runtime, version);
  return contract ? contract.features.includes(feature) : false;
}

/** Get all registered runtime keys. */
export function getRegisteredRuntimes(): string[] {
  return Object.keys(RUNTIME_TO_COMPONENT);
}
