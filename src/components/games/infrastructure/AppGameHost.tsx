/**
 * AppGameHost — runtime-driven game router (app + web).
 *
 * Routes rendering by runtimeType (app | web) + runtime identifier + version.
 * Game logic is 100% server-side. This component only RENDERs and sends commands.
 *
 * Architecture:
 *   Backend provides: slug, runtimeType, runtime, runtimeVersion, config, bundle
 *   AppGameHost resolves: which component to render via RUNTIME_TO_COMPONENT
 *   Game component receives: socket state, sends commands via socket
 *
 *   runtimeType = 'app'  → native React Native component (RUNTIME_TO_COMPONENT)
 *   runtimeType = 'web'  → HTML5 bundle in WebView (WebGameHost + TaddleBridge)
 *
 * Compatibility checks:
 *   1. runtime + version must be registered in RUNTIME_TO_COMPONENT
 *   2. minAppVersion must be met
 *   3. Graceful fallback with telemetry on failure
 */

import React from "react";
import { View, StyleSheet, Text } from "react-native";
import {
  getRuntimeComponent,
  isRuntimeSupported,
  isVersionCompatible,
  isProtocolCompatible,
} from "../../../games/GameRuntimeRegistry";
import { warn } from "../../../utils/logger";

// ── Telemetry helper ─────────────────────────────────────────────────────
function emitTelemetry(event: string, data: Record<string, any>) {
  // TODO: wire to real telemetry service (Sentry, PostHog, etc.)
  warn(`[Telemetry] ${event}`, data);
}

// ── Loading indicator ────────────────────────────────────────────────────
function BrandedGameLoader() {
  return (
    <View style={styles.loader}>
      <Text style={styles.loaderText}>Loading game...</Text>
    </View>
  );
}

// ── Fallback screens ─────────────────────────────────────────────────────

function UnsupportedRuntime({ slug, runtime, version }: { slug?: string; runtime?: string; version?: number }) {
  return (
    <View style={styles.loader}>
      <Text style={styles.fallbackEmoji}>🎮</Text>
      <Text style={styles.fallbackTitle}>Game unavailable</Text>
      <Text style={styles.fallbackText}>
        This game requires a runtime that isn't supported on your device.
      </Text>
      <Text style={styles.fallbackHint}>
        {runtime}@{version ?? "?"} · {slug}
      </Text>
    </View>
  );
}

function UpdateRequired({ minAppVersion }: { minAppVersion: string }) {
  return (
    <View style={styles.loader}>
      <Text style={styles.fallbackEmoji}>📱</Text>
      <Text style={styles.fallbackTitle}>Update required</Text>
      <Text style={styles.fallbackText}>
        This game requires app version {minAppVersion} or later.
      </Text>
      <Text style={styles.fallbackHint}>Please update the app to play.</Text>
    </View>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────
interface GameHostProps {
  /** Game metadata from backend. */
  game: {
    slug?: string;
    runtimeType?: string;       // 'app' | 'web'
    runtime?: string;           // 'ludo', 'chess', etc.
    runtimeVersion?: number;    // 1, 2, 3...
    minAppVersion?: string;     // semver: '1.8.0'
    protocolVersion?: number;   // backend declares which protocol it speaks
    config?: Record<string, any>;
    assets?: Record<string, any>;
    bundle?: { url: string; hash: string };  // web only
    /** Asset set ID from GameDefinition — resolved assets are passed to the Runtime. */
    assetSetId?: string;
    /** Asset manifest version from GameDefinition. */
    assetManifestVersion?: number;
  };

  /** Props to pass to the game component (socket, session, players, etc.) */
  gameProps: Record<string, any>;

  /** Resolved game assets (map of asset key → local file URI). Passed to Runtime for rendering. */
  resolvedAssets?: Record<string, string>;
}

/**
 * AppGameHost — the single entry point for rendering any game.
 *
 * Usage:
 *   <AppGameHost
 *     game={{
 *       slug: 'ludo',
 *       runtimeType: 'app',
 *       runtime: 'ludo',
 *       runtimeVersion: 1,
 *       minAppVersion: '1.0.0',
 *     }}
 *     gameProps={{ matchId, userId, wsToken, players, ... }}
 *   />
 */
export default function AppGameHost({ game, gameProps, resolvedAssets }: GameHostProps) {
  const {
    slug,
    runtime,
    runtimeVersion = 1,
    runtimeType = "app",
    minAppVersion,
    protocolVersion: backendProtocolVersion,
  } = game;

  // Backend must send `runtime`. No fallbacks, no aliases — SSOT.
  // If runtime is missing, the game simply won't render (UnsupportedRuntime).

  // ── Web Runtime ──────────────────────────────────────────────────────
  if (runtimeType === "web") {
    const WebGameHost = React.lazy(() => import("./WebGameHost"));

    if (!game.bundle?.url) {
      warn(`[AppGameHost] Web game ${runtime || slug} has no bundle URL`);
      emitTelemetry("GAME_ASSET_MISSING", { slug, runtime, reason: "no_bundle_url" });
      return <UnsupportedRuntime slug={slug} runtime={runtime} version={runtimeVersion} />;
    }

    return (
      <React.Suspense fallback={<BrandedGameLoader />}>
        <WebGameHost
          bundleUrl={game.bundle.url}
          bundleHash={game.bundle.hash}
          gameConfig={game.config || {}}
          gameProps={gameProps}
        />
      </React.Suspense>
    );
  }

  // ── App Runtime (native React Native) ────────────────────────────────
  // Validation flow: runtime → version → protocol → app version → launch

  // 1. Check if runtime is registered (closed allowlist)
  if (!runtime || !isRuntimeSupported(runtime, runtimeVersion)) {
    warn(`[AppGameHost] Unsupported runtime: ${runtime}@${runtimeVersion}`);
    emitTelemetry("GAME_RUNTIME_UNSUPPORTED", { slug, runtime, runtimeVersion });
    return <UnsupportedRuntime slug={slug} runtime={runtime} version={runtimeVersion} />;
  }

  // 2. Check protocol compatibility (backend vs client contract)
  if (!isProtocolCompatible(runtime, runtimeVersion, backendProtocolVersion)) {
    warn(`[AppGameHost] Protocol mismatch: backend=${backendProtocolVersion}, runtime=${runtime}@${runtimeVersion}`);
    emitTelemetry("GAME_PROTOCOL_MISMATCH", {
      slug,
      runtime,
      runtimeVersion,
      backendProtocolVersion,
    });
    return <UnsupportedRuntime slug={slug} runtime={runtime} version={runtimeVersion} />;
  }

  // 3. Check app version compatibility (semver)
  if (!isVersionCompatible(minAppVersion)) {
    warn(`[AppGameHost] App version mismatch: need ${minAppVersion}, have ${"APP_VERSION"}`);
    emitTelemetry("GAME_RUNTIME_VERSION_MISMATCH", {
      slug,
      runtime,
      runtimeVersion,
      minAppVersion,
    });
    return <UpdateRequired minAppVersion={minAppVersion || "?"} />;
  }

  const GameComponent = getRuntimeComponent(runtime, runtimeVersion)! as React.ComponentType<any>;

  return (
    <React.Suspense fallback={<BrandedGameLoader />}>
      <GameComponent {...gameProps} assets={resolvedAssets} />
    </React.Suspense>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
    paddingHorizontal: 32,
  },
  loaderText: {
    color: "#fff",
    fontSize: 16,
  },
  fallbackEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  fallbackTitle: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
  },
  fallbackText: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  fallbackHint: {
    color: "#475569",
    fontSize: 12,
    fontFamily: "monospace",
  },
});
