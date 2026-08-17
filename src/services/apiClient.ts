import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import Constants from "expo-constants";

const debuggerHost = Constants.expoConfig?.hostUri;
const localhost = debuggerHost?.split(':')[0];

// Dev builds (Expo Go / dev client) point at the Metro host so a phone on the
// same network can reach the local backend. Production builds must be given
// EXPO_PUBLIC_BACKEND_URL at build time; if it's missing we fail loudly by
// logging and falling back to the production domain rather than silently
// dialing an emulator-only address (10.0.2.2 / localhost) that can never work
// on a real device.
const fallbackIp = Platform.OS === "android" ? "10.0.2.2" : "localhost";
const currentIp = localhost || fallbackIp;

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL
  ? `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1`
  : __DEV__
    ? `http://${currentIp}:8080/api/v1`
    : (() => {
        console.warn('[apiClient] EXPO_PUBLIC_BACKEND_URL is not set in this production build. App will not be able to reach the backend server');
        return 'https://www.taddlebox.com';
      })();

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 15000, // 15 seconds timeout
});

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
        if (refreshToken) {
          const res = await axios.post(`${API_URL}/auth/refresh-token`, {
            refreshToken,
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
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            return apiClient(originalRequest);
          }
        }
      } catch (refreshError) {
        console.error("Refresh token failed:", refreshError);
        // Dispatch event or callback to logout the user could be implemented here
      }
    }
    return Promise.reject(error);
  },
);
