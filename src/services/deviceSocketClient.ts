/**
 * deviceSocketClient.ts
 *
 * Device-level WebSocket connection that stays open regardless of which
 * account is active. Authenticates by deviceId (UUID generated at install
 * time, stored in SecureStore).
 *
 * Purpose: receives `auth:session_revoked` events when another device calls
 * "Log out from all devices", so the client can immediately clean up the
 * affected account from the switcher.
 */
import { io, Socket } from "socket.io-client";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { EventEmitter } from "events";

// ── URL resolution (same logic as socketClient.ts) ────────────────────────
const debuggerHost = Constants.expoConfig?.hostUri;
const localhost = debuggerHost?.split(":")[0];
const fallbackIp = Platform.OS === "android" ? "10.0.2.2" : "localhost";
const currentIp = localhost || fallbackIp;

const SOCKET_URL = process.env.EXPO_PUBLIC_BACKEND_URL
  ? process.env.EXPO_PUBLIC_BACKEND_URL.replace(/\/+$/, "")
  : __DEV__
    ? `http://${currentIp}:1999`
    : "https://taddlebox.com";

// ── Types ─────────────────────────────────────────────────────────────────
export interface SessionRevokedPayload {
  /** The userId whose sessions were revoked (the account to remove). */
  userId: number | string;
}

// ── Device Socket Client ──────────────────────────────────────────────────
class DeviceSocketClient {
  private socket: Socket | null = null;
  private isConnecting = false;
  public events = new EventEmitter();

  async connect() {
    if (this.socket?.connected || this.isConnecting) return;

    const deviceId = await SecureStore.getItemAsync("deviceId");
    if (!deviceId) {
      console.warn("[deviceSocket] No deviceId found — skipping device socket");
      return;
    }

    this.isConnecting = true;

    try {
      this.socket = io(SOCKET_URL, {
        // Authenticate by deviceId, not JWT
        auth: { deviceId },
        transports: ["websocket"],
        extraHeaders: {
          "ngrok-skip-browser-warning": "true",
        },
        // Reconnect with backoff
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
      });

      this.socket.on("connect", () => {
        this.isConnecting = false;
        console.log("[deviceSocket] Connected:", this.socket?.id);
      });

      this.socket.on("disconnect", (reason) => {
        this.isConnecting = false;
        console.log("[deviceSocket] Disconnected:", reason);
      });

      this.socket.on("connect_error", (err) => {
        this.isConnecting = false;
        console.error("[deviceSocket] Connection error:", err.message);
      });

      // ── Session revoked event ──────────────────────────────────────────
      // Another device called "Log out from all devices" for one of our
      // stored accounts. Clean up that account immediately.
      this.socket.on("auth:session_revoked", (data: SessionRevokedPayload) => {
        console.log("[deviceSocket] Session revoked for userId:", data.userId);
        this.events.emit("auth:session_revoked", data);
      });
    } catch (error) {
      this.isConnecting = false;
      console.error("[deviceSocket] Failed to connect:", error);
    }
  }

  disconnect() {
    this.isConnecting = false;
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const deviceSocketClient = new DeviceSocketClient();
