import Constants from "expo-constants";
import { Platform } from "react-native";
import { warn } from '../utils/logger';

/**
 * Single source of truth for the backend origin. Every backend-derived URL —
 * the API client (apiClient.ts), sockets, and the /app-assets asset URLs
 * (games/assets.ts, lottie.service.ts) — builds on this so the domain always
 * comes from EXPO_PUBLIC_BACKEND_URL (.env / .env.production / eas.json
 * build profile), never a hardcoded host.
 *
 * Dev builds (Expo Go / dev client) fall back to the Metro host so a phone on
 * the same network can reach the local backend. Production falls back to the
 * taddlebox.com domain with a loud warning — the env var MUST be set in the
 * production build profile.
 */
export function getBackendOrigin(): string {
  if (process.env.EXPO_PUBLIC_BACKEND_URL) {
    return process.env.EXPO_PUBLIC_BACKEND_URL.replace(/\/+$/, "");
  }
  const debuggerHost = Constants.expoConfig?.hostUri;
  const currentIp =
    debuggerHost?.split(":")[0] ||
    (Platform.OS === "android" ? "10.0.2.2" : "localhost");
  if (__DEV__) return `http://${currentIp}:1999`;
  warn(
    "[backendUrl] EXPO_PUBLIC_BACKEND_URL is not set in this production build. App will not be able to reach the backend server",
  );
  return "https://www.taddlebox.com";
}
