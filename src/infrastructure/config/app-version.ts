/**
 * App version — single source of truth for version compatibility checks.
 *
 * Read from Expo config at build time. Used by GameRuntimeRegistry to verify
 * that the installed app version meets a runtime's minAppVersion requirement.
 */
import Constants from "expo-constants";

export const APP_VERSION: string =
  Constants.expoConfig?.version || "0.0.0";
