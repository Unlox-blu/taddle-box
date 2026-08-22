import axios from "axios";
import * as SecureStore from "expo-secure-store";
import * as Crypto from 'expo-crypto';
import { getBackendOrigin } from "./backendUrl";
import { log, warn, error as logError } from "../utils/logger";

// Origin comes from EXPO_PUBLIC_BACKEND_URL (.env / build profile) via the
// shared resolver — dev falls back to the Metro host, production warns loudly
// if the env var is missing rather than silently dialing an emulator address.
const API_URL = `${getBackendOrigin()}/api/v1`;

// Stable device ID: generated once per installation, stored in SecureStore.
// Used by the backend to identify this physical device for multi-session auth.
let _deviceId: string | null = null;
export const getDeviceId = async (): Promise<string> => {
  if (_deviceId) return _deviceId;
  let id = await SecureStore.getItemAsync('deviceId');
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync('deviceId', id);
  }
  _deviceId = id;
  return id;
};

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 15000, // 15 seconds timeout
});

// ── Forced logout handler ──────────────────────────────────────────────────
// When the refresh-token call itself fails with 401, the session has been
// revoked (e.g. "Log out from all devices" on another device). AuthContext
// registers a handler here so the interceptor can trigger a clean logout
// without importing React context.
type ForcedLogoutHandler = () => void | Promise<void>;
let _forcedLogoutHandler: ForcedLogoutHandler | null = null;

/** Register the forced-logout callback. Called by AuthContext on mount. */
export const setForcedLogoutHandler = (handler: ForcedLogoutHandler) => {
  _forcedLogoutHandler = handler;
};

/** Unregister on unmount. */
export const clearForcedLogoutHandler = () => {
  _forcedLogoutHandler = null;
};

// Interceptor to inject Authorization header
apiClient.interceptors.request.use(
  async (config) => {
    try {
      const token = await SecureStore.getItemAsync("accessToken");
      if (token && config.headers && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      logError("Error fetching token from SecureStore", err);
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ── Refresh-token mutex ─────────────────────────────────────────────────────
// When the access token expires, multiple concurrent requests may all get a
// 401 simultaneously. Without a mutex, each would independently hit the
// refresh endpoint — the server rotates the refresh token on the first call,
// so subsequent calls fail with 401 (the old token is now invalid) and
// trigger a forced logout. A simple promise-based mutex ensures only ONE
// refresh runs at a time; other requests await the same result.
let _refreshPromise: Promise<string | null> | null = null;

/** Publicly exposed so AuthContext can proactively refresh before expiry. */
export async function doRefreshToken(): Promise<string | null> {
  const refreshToken = await SecureStore.getItemAsync("refreshToken");
  const sessionId = await SecureStore.getItemAsync("sessionId");
  if (!refreshToken) return null;

  const res = await axios.post(`${API_URL}/auth/refresh-token`, {
    refreshToken,
    sessionId,
  });
  const newAccessToken = res.data?.data?.accessToken || res.data?.accessToken;
  if (!newAccessToken) return null;

  await SecureStore.setItemAsync("accessToken", newAccessToken);
  const newRefreshToken = res.data?.data?.refreshToken || res.data?.refreshToken;
  if (newRefreshToken) {
    await SecureStore.setItemAsync("refreshToken", newRefreshToken);
  }
  const newSessionId = res.data?.data?.sessionId || res.data?.sessionId;
  if (newSessionId) {
    await SecureStore.setItemAsync("sessionId", newSessionId);
  }
  // Persist the new token expiry so AuthContext's proactive timer can
  // schedule the next refresh. If the backend doesn't include tokenExpiresAt,
  // log a warning — proactive refresh will be disabled until it does.
  const expiresAt = res.data?.data?.tokenExpiresAt || res.data?.tokenExpiresAt;
  if (expiresAt) {
    await SecureStore.setItemAsync('tokenExpiresAt', String(Number(expiresAt)));
  } else {
    warn('[apiClient] Backend refresh response missing tokenExpiresAt — proactive refresh will not schedule until the backend provides it.');
    // Clear any stale expiry so the proactive timer falls back to reactive
    await SecureStore.deleteItemAsync('tokenExpiresAt');
  }
  return newAccessToken;
}

// Interceptor to handle 401 Unauthorized (Token Refresh)
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        // If a refresh is already in flight, wait for it instead of starting
        // a second one (which would fail against the rotated token).
        if (!_refreshPromise) {
          _refreshPromise = doRefreshToken().catch(() => null);
        }
        const newAccessToken = await _refreshPromise;
        if (newAccessToken) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return apiClient(originalRequest);
        }
        // Refresh returned no token — fall through to reject below
      } catch (refreshError: any) {
        // This path is now unlikely since doRefreshToken is catch-guarded
        // above, but kept as a safety net.
        logError("Refresh token failed:", refreshError?.message || refreshError);
      } finally {
        // Clear the mutex so the next 401 cycle starts a fresh refresh.
        _refreshPromise = null;
      }

      // If we get here, refresh failed. Distinguish revoked session from
      // transient network failure. A 401 from the refresh endpoint means the
      // session was revoked or the refresh token itself expired.
      const refreshFailedWithAuth =
        error?.response?.status === 401 ||
        error?.response?.status === 403;

      if (refreshFailedWithAuth) {
        warn("Session revoked or refresh token expired — forcing logout");
        setTimeout(() => {
          _forcedLogoutHandler?.();
        }, 0);
      } else {
        logError("Refresh token failed (transient):", error?.message || error);
      }
    }
    return Promise.reject(error);
  },
);
