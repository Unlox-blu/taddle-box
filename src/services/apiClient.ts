import axios from "axios";
import * as SecureStore from "expo-secure-store";
import * as Crypto from 'expo-crypto';
import { getBackendOrigin } from "./backendUrl";

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
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error("Error fetching token from SecureStore", error);
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Interceptor to handle 401 Unauthorized (Token Refresh)
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = await SecureStore.getItemAsync("refreshToken");
        const sessionId = await SecureStore.getItemAsync("sessionId");
        if (refreshToken) {
          const res = await axios.post(`${API_URL}/auth/refresh-token`, {
            refreshToken,
            sessionId,  // Backend uses this to look up the session in client_registry
          });
          const newAccessToken =
            res.data?.data?.accessToken || res.data?.accessToken;
          if (newAccessToken) {
            await SecureStore.setItemAsync("accessToken", newAccessToken);
            // The backend ROTATES the refresh token on every refresh — persist
            // the new one too, or the next refresh fails against the DB hash.
            const newRefreshToken =
              res.data?.data?.refreshToken || res.data?.refreshToken;
            if (newRefreshToken) {
              await SecureStore.setItemAsync("refreshToken", newRefreshToken);
            }
            // Also persist the new sessionId if the backend issued one
            const newSessionId =
              res.data?.data?.sessionId || res.data?.sessionId;
            if (newSessionId) {
              await SecureStore.setItemAsync("sessionId", newSessionId);
            }
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            return apiClient(originalRequest);
          }
        }
      } catch (refreshError: any) {
        // ── Distinguish revoked session from transient network failure ──
        // A 401 from the refresh endpoint means the session was revoked
        // (e.g. "Log out from all devices" from another device) or the
        // refresh token itself expired. Either way, the user must re-login.
        //
        // Network errors (ECONNREFUSED, timeout, no response) are transient
        // and should NOT trigger a forced logout — the user might just have
        // a temporarily flaky connection.
        const refreshFailedWithAuth =
          refreshError?.response?.status === 401 ||
          refreshError?.response?.status === 403;

        if (refreshFailedWithAuth) {
          console.warn("Session revoked or refresh token expired — forcing logout");
          // Fire-and-forget: the handler cleans up tokens, account store, socket.
          // Use setTimeout(0) to avoid blocking the interceptor return path.
          setTimeout(() => {
            _forcedLogoutHandler?.();
          }, 0);
        } else {
          console.error("Refresh token failed (transient):", refreshError?.message || refreshError);
          // Transient network error — do NOT force logout. The next API call
          // will retry the normal 401 → refresh flow.
        }
      }
    }
    return Promise.reject(error);
  },
);
