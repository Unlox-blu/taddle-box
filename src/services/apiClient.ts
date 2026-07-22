import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import Constants from "expo-constants";

const debuggerHost = Constants.expoConfig?.hostUri;
const localhost = debuggerHost?.split(':')[0];

// Use dynamic IP for physical devices, fallback to Android emulator IP or localhost
const fallbackIp = Platform.OS === "android" ? "10.0.2.2" : "localhost";
const currentIp = localhost || fallbackIp;

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL 
  ? `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1` 
  : `http://${currentIp}:8080/api/v1`;

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
