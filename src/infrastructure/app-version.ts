import Constants from "expo-constants";
import * as Application from "expo-application";

/**
 * Version + build-type SSOT.
 *
 * app.config.js appends `-dev.<timestamp>` / `-direct.<timestamp>` to the
 * version for development and direct (sideloaded APK) builds; store builds
 * keep the bare semver. `Application.nativeApplicationVersion` reads the
 * version of the *installed* binary from the OS (most accurate); the
 * expoConfig value is the build-time fallback (and what dev clients see).
 */

export type AppBuildType = "dev" | "direct" | "store";

const rawVersion =
  Application.nativeApplicationVersion ||
  Constants.expoConfig?.version ||
  "1.0.0";

const buildType: AppBuildType = __DEV__
  ? "dev"
  : /-direct\./.test(rawVersion)
    ? "direct"
    : /-dev\./.test(rawVersion)
      ? "dev"
      : "store";

/** Bare version string, e.g. "1.0.0" or "1.0.0-direct.1757318400". */
export const appVersion = rawVersion;

/** Which distribution channel this binary came from. */
export const appBuildType = buildType;

/** Human-readable label, e.g. "v1.0.0-direct" or "v1.0.0" for store builds. */
export const appVersionLabel = `v${rawVersion}${
  buildType === "store" ? "" : ` (${buildType})`
}`;
