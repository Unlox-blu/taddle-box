import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { apiClient } from "./apiClient";
import * as Crypto from "expo-crypto";
// Foreground notifications: we render our own in-app banner, so don't double up
// with the OS alert. Background/killed deliveries still use the system tray.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const isAndroid = Platform.OS === "android";

// ── Device ID ───────────────────────────────────────────────────────────────
const DEVICE_ID_KEY = "push_device_id";

async function getOrCreateDeviceId(): Promise<string> {
  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  }
  return id;
}

// Creates the default Android notification channel (required on Android 8+).
async function ensureAndroidChannel() {
  if (!isAndroid) return;
  try {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#7C3AED",
    });
  } catch (e) {
    console.warn("Failed to create notification channel", e);
  }
}

/**
 * Requests permission and registers this device with the backend so push
 * notifications can be delivered.  Returns the Expo push token (or null when
 * unavailable — e.g. simulator, permission denied, or web).
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    if (!Device.isDevice) {
      console.warn("Push tokens only work on physical devices");
      return null;
    }

    await ensureAndroidChannel();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      console.warn("Push notification permission not granted:", finalStatus);
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId;

    const pushToken = (
      await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined,
      )
    ).data;

    if (pushToken) {
      const deviceId = await getOrCreateDeviceId();
      await apiClient
        .post("/push-notification/register", {
          pushToken,
          pushProvider: "expo",
          deviceId,
          platform: isAndroid ? "android" : "ios",
        })
        .catch((e) => console.warn("Failed to register push token with backend", e));
    }

    return pushToken;
  } catch (e) {
    console.warn("Push registration failed", e);
    return null;
  }
}

// ── Android token refresh listener ───────────────────────────────────────────
let tokenRefreshSubscription: ReturnType<
  typeof Notifications.addPushTokenListener
> | null = null;

export function startTokenRefreshListener() {
  if (tokenRefreshSubscription) return;

  tokenRefreshSubscription = Notifications.addPushTokenListener(
    async (newToken) => {
      try {
        console.info("[PushNotification] Token refreshed, re-registering with backend");
        const deviceId = await getOrCreateDeviceId();
        await apiClient.post("/push-notification/register", {
          pushToken: newToken.data,
          pushProvider: "expo",
          deviceId,
          platform: isAndroid ? "android" : "ios",
        });
      } catch (e) {
        console.warn("Failed to re-register refreshed push token", e);
      }
    },
  );
}

export function stopTokenRefreshListener() {
  if (tokenRefreshSubscription) {
    tokenRefreshSubscription.remove();
    tokenRefreshSubscription = null;
  }
}

/** Clears the app icon badge (iOS). */
export async function clearPushBadge() {
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch {
    // not supported on all platforms
  }
}
